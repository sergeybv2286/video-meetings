import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import type { ReadStream } from 'node:fs';
import { Prisma, type MeetingFile } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveStoragePath } from './meeting-file.config.js';
import type { StoredFileInfo } from './meeting-file.storage.js';
import { toMeetingFileDto, type MeetingFileDto } from './meeting-files.dto.js';
import { TranscriptionQueue } from './transcription/transcription-queue.js';

@Injectable()
export class MeetingFilesService {
  private readonly logger = new Logger(MeetingFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transcriptions: TranscriptionQueue,
  ) {}

  /** Сохраняет метаданные уже записанного на диск файла. */
  async create(
    meetingId: string,
    file: Express.Multer.File & StoredFileInfo,
  ): Promise<MeetingFileDto> {
    try {
      const created = await this.prisma.meetingFile.create({
        data: {
          meetingId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          storageKey: file.storageKey,
        },
      });
      return await this.withTranscription(created);
    } catch (error) {
      await this.removeFromDisk(file.storageKey);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Файл уже загружен для этой встречи');
      }
      throw error;
    }
  }

  /**
   * Заменяет файл встречи уже записанным на диск новым. Сначала обновляются метаданные,
   * и только потом удаляется старый файл: при ошибке старый остаётся нетронутым, а новый
   * удаляется. Если файла ещё не было, ведёт себя как `create`.
   */
  async replace(
    meetingId: string,
    file: Express.Multer.File & StoredFileInfo,
  ): Promise<MeetingFileDto> {
    const previous = await this.prisma.meetingFile.findUnique({
      where: { meetingId },
    });
    if (!previous) return this.create(meetingId, file);
    let count: number;
    try {
      // Условие по storageKey: параллельная замена уже могла подменить файл.
      ({ count } = await this.prisma.meetingFile.updateMany({
        where: { id: previous.id, storageKey: previous.storageKey },
        data: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          storageKey: file.storageKey,
          uploadedAt: new Date(),
        },
      }));
    } catch (error) {
      await this.removeFromDisk(file.storageKey);
      throw error;
    }
    if (count === 0) {
      const current = await this.prisma.meetingFile
        .findUnique({ where: { meetingId } })
        .catch(() => null);
      // Файл удалили параллельно — создаём заново.
      if (!current) return this.create(meetingId, file);
      // Файл заменили параллельно: свой новый файл не нужен, чужой не трогаем.
      await this.removeFromDisk(file.storageKey);
      throw new ConflictException(
        'Файл одновременно изменён другим запросом. Повторите попытку',
      );
    }
    const updated = await this.prisma.meetingFile.findUniqueOrThrow({
      where: { id: previous.id },
    });
    await this.removeFromDisk(previous.storageKey);
    return this.withTranscription(updated);
  }

  async findByMeeting(meetingId: string): Promise<MeetingFileDto> {
    const file = await this.prisma.meetingFile.findUnique({
      where: { meetingId },
      include: { transcription: { select: { status: true } } },
    });
    if (!file) throw new NotFoundException('Файл не найден');
    return toMeetingFileDto(file, file.transcription?.status ?? null);
  }

  /** Открывает файл на чтение; 404, если записи нет или файл пропал с диска. */
  async openForDownload(meetingId: string): Promise<{
    stream: ReadStream;
    fileName: string;
    mimeType: string;
    size: number;
  }> {
    const file = await this.prisma.meetingFile.findUnique({
      where: { meetingId },
    });
    if (!file) throw new NotFoundException('Файл не найден');
    const fullPath = resolveStoragePath(file.storageKey);
    let size: number;
    try {
      size = (await stat(fullPath)).size;
    } catch {
      this.logger.error(`Файл ${file.storageKey} отсутствует на диске`);
      throw new NotFoundException('Файл не найден');
    }
    return {
      stream: createReadStream(fullPath),
      fileName: file.originalName,
      mimeType: file.mimeType,
      size,
    };
  }

  /** Удаляет запись и файл с диска; 404, если файла нет. Сбой удаления с диска не ломает запрос. */
  async remove(meetingId: string): Promise<void> {
    const file = await this.prisma.meetingFile.findUnique({
      where: { meetingId },
    });
    if (!file) throw new NotFoundException('Файл не найден');
    try {
      await this.prisma.meetingFile.delete({ where: { id: file.id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Файл не найден');
      }
      throw error;
    }
    // Запись транскрибации ушла каскадом; прерываем идущий процесс, результат не запишется.
    this.transcriptions.cancel(file.id);
    await this.removeFromDisk(file.storageKey);
  }

  async exists(meetingId: string): Promise<boolean> {
    const count = await this.prisma.meetingFile.count({ where: { meetingId } });
    return count > 0;
  }

  /**
   * Ставит MP4/MP3 в очередь транскрибации. Сбой постановки не отменяет загрузку:
   * файл уже сохранён, а статуса транскрибации просто не будет.
   */
  private async withTranscription(file: MeetingFile): Promise<MeetingFileDto> {
    try {
      return toMeetingFileDto(file, await this.transcriptions.enqueue(file));
    } catch (error) {
      this.logger.error(
        `Не удалось поставить в очередь файл ${file.id}`,
        error,
      );
      return toMeetingFileDto(file);
    }
  }

  /** Сбой удаления не должен перекрывать исходную ошибку; остаток подчистит очистка сирот. */
  private async removeFromDisk(storageKey: string): Promise<void> {
    try {
      await rm(resolveStoragePath(storageKey), { force: true });
    } catch (error) {
      this.logger.error(`Не удалось удалить файл ${storageKey}`, error);
    }
  }
}
