import { Injectable, Logger } from '@nestjs/common';
import type {
  Prisma,
  TranscriptionStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { resolveStoragePath } from '../meeting-file.config.js';
import {
  getTranscriptionTimeoutMs,
  isTranscribable,
} from './transcription.config.js';
import {
  TranscriptionError,
  TranscriptionRunner,
} from './transcription-runner.js';

const WRITE_ATTEMPTS = 3;
const GENERIC_ERROR = 'Не удалось выполнить транскрибацию';
const TIMEOUT_ERROR =
  'Превышено максимальное время обработки файла. Попробуйте повторить позже';

/** Причины прерывания идущей задачи (`AbortController.abort(reason)`). */
const CANCELLED = Symbol('cancelled');
const TIMED_OUT = Symbol('timed-out');

interface RunningJob {
  meetingFileId: string;
  controller: AbortController;
}

/**
 * Последовательная очередь транскрибации в процессе API: один файл за раз, в порядке загрузки.
 * Состояние задач хранится в `MeetingFileTranscription`, в памяти — только порядок.
 */
@Injectable()
export class TranscriptionQueue {
  private readonly logger = new Logger(TranscriptionQueue.name);
  private readonly pending: string[] = [];
  private running: RunningJob | null = null;
  private draining: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: TranscriptionRunner,
  ) {}

  /**
   * Ставит файл в очередь, сбрасывая прежний результат и прерывая устаревшую задачу.
   * Для форматов, кроме MP4/MP3, задачи нет: прежняя запись (если файл заменили) удаляется.
   * Возвращает статус задачи.
   */
  async enqueue(file: {
    id: string;
    mimeType: string;
  }): Promise<TranscriptionStatus | null> {
    this.cancel(file.id);
    if (!isTranscribable(file.mimeType)) {
      await this.prisma.meetingFileTranscription.deleteMany({
        where: { meetingFileId: file.id },
      });
      return null;
    }
    await this.prisma.meetingFileTranscription.upsert({
      where: { meetingFileId: file.id },
      create: { meetingFileId: file.id },
      update: { status: 'QUEUED', text: null, error: null, completedAt: null },
    });
    this.push(file.id);
    return 'QUEUED';
  }

  /**
   * Ставит в очередь заново задачу в статусе «Ошибка». `false`, если задачи нет
   * или она не в этом статусе (из двух одновременных повторов выигрывает один).
   */
  async retry(meetingFileId: string): Promise<boolean> {
    const { count } = await this.prisma.meetingFileTranscription.updateMany({
      where: { meetingFileId, status: 'FAILED' },
      data: { status: 'QUEUED', text: null, error: null, completedAt: null },
    });
    if (count === 0) return false;
    this.push(meetingFileId);
    return true;
  }

  /** Прерывает идущую и убирает ожидающую задачу файла; записью занимается вызывающий. */
  cancel(meetingFileId: string): void {
    const index = this.pending.indexOf(meetingFileId);
    if (index !== -1) this.pending.splice(index, 1);
    if (this.running?.meetingFileId === meetingFileId) {
      this.running.controller.abort(CANCELLED);
    }
  }

  /**
   * После перезапуска возвращает в очередь задачи «В очереди» и «В процессе» в порядке
   * загрузки файлов. Вызывается после очистки сирот: задач удалённых файлов уже нет.
   */
  async recover(): Promise<number> {
    await this.prisma.meetingFileTranscription.updateMany({
      where: { status: 'PROCESSING' },
      data: { status: 'QUEUED' },
    });
    const jobs = await this.prisma.meetingFileTranscription.findMany({
      where: { status: 'QUEUED' },
      select: { meetingFileId: true },
      orderBy: { meetingFile: { uploadedAt: 'asc' } },
    });
    for (const job of jobs) this.push(job.meetingFileId);
    return jobs.length;
  }

  /** Резолвится, когда очередь опустела (нужно тестам и корректной остановке). */
  async onIdle(): Promise<void> {
    while (this.draining) await this.draining;
  }

  private push(meetingFileId: string): void {
    if (!this.pending.includes(meetingFileId)) this.pending.push(meetingFileId);
    if (this.draining) return;
    this.draining = this.drain();
  }

  private async drain(): Promise<void> {
    try {
      for (let id = this.pending.shift(); id; id = this.pending.shift()) {
        try {
          await this.process(id);
        } catch (error) {
          // Сбой одной задачи (например, БД) не должен останавливать очередь.
          this.logger.error(`Сбой обработки транскрибации ${id}`, error);
        }
      }
    } finally {
      // Синхронно с выходом из цикла: новый `push` не может «проскочить» между ними.
      this.draining = null;
    }
  }

  /** Запись результата переживает короткие сбои БД: иначе задача навсегда осталась бы «В процессе». */
  private async writeResult(
    where: Prisma.MeetingFileTranscriptionWhereInput,
    data: Prisma.MeetingFileTranscriptionUpdateManyMutationInput,
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.prisma.meetingFileTranscription.updateMany({ where, data });
        return;
      } catch (error) {
        if (attempt === WRITE_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }

  private async process(meetingFileId: string): Promise<void> {
    const file = await this.prisma.meetingFile.findUnique({
      where: { id: meetingFileId },
      include: { transcription: true },
    });
    if (file?.transcription?.status !== 'QUEUED') return;
    // Результат пишется только пока файл тот же: после замены `storageKey` меняется.
    const target = {
      meetingFileId,
      status: 'PROCESSING' as const,
      meetingFile: { storageKey: file.storageKey },
    };
    const claimed = await this.prisma.meetingFileTranscription.updateMany({
      where: { ...target, status: 'QUEUED' },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) return;

    const controller = new AbortController();
    this.running = { meetingFileId, controller };
    const timer = setTimeout(
      () => controller.abort(TIMED_OUT),
      getTranscriptionTimeoutMs(),
    );
    try {
      const text = await this.runner.run(
        resolveStoragePath(file.storageKey),
        controller.signal,
      );
      if (controller.signal.aborted) throw new Error('Задача прервана');
      await this.writeResult(target, {
        status: 'DONE',
        text,
        error: null,
        completedAt: new Date(),
      });
    } catch (error) {
      const reason: unknown = controller.signal.aborted
        ? controller.signal.reason
        : undefined;
      // Файл удалён или заменён: результат прерванной задачи никому не нужен.
      if (reason === CANCELLED) return;
      const message =
        reason === TIMED_OUT
          ? TIMEOUT_ERROR
          : error instanceof TranscriptionError
            ? error.message
            : GENERIC_ERROR;
      this.logger.error(
        `Транскрибация файла ${meetingFileId} не удалась`,
        error,
      );
      await this.writeResult(target, { status: 'FAILED', error: message });
    } finally {
      clearTimeout(timer);
      this.running = null;
    }
  }
}
