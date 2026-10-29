import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { extname } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  toTranscriptionDto,
  type TranscriptionDto,
} from './transcription.dto.js';
import { TranscriptionQueue } from './transcription-queue.js';

@Injectable()
export class TranscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: TranscriptionQueue,
  ) {}

  /** Статус и текст; 404, если файла или транскрибации (формат не MP4/MP3) нет. */
  async find(meetingId: string): Promise<TranscriptionDto> {
    const { transcription } = await this.findFile(meetingId);
    return toTranscriptionDto(transcription);
  }

  /** Текст и имя `.txt` для скачивания; 409, пока результата нет. */
  async getDownload(
    meetingId: string,
  ): Promise<{ text: string; fileName: string }> {
    const { file, transcription } = await this.findFile(meetingId);
    if (transcription.status !== 'DONE' || transcription.text === null) {
      throw new ConflictException('Транскрибация ещё не готова');
    }
    const ext = extname(file.originalName);
    const base = ext
      ? file.originalName.slice(0, -ext.length)
      : file.originalName;
    return {
      text: transcription.text,
      fileName: `${base || 'transcription'}.txt`,
    };
  }

  /** Повторный запуск; 409, если задача не в статусе «Ошибка». */
  async retry(meetingId: string): Promise<TranscriptionDto> {
    const { file } = await this.findFile(meetingId);
    if (!(await this.queue.retry(file.id))) {
      throw new ConflictException(
        'Повторить можно только транскрибацию со статусом «Ошибка»',
      );
    }
    return this.find(meetingId);
  }

  private async findFile(meetingId: string) {
    const file = await this.prisma.meetingFile.findUnique({
      where: { meetingId },
      include: { transcription: true },
    });
    if (!file) throw new NotFoundException('Файл не найден');
    if (!file.transcription) {
      throw new NotFoundException('Транскрибации для этого файла нет');
    }
    return { file, transcription: file.transcription };
  }
}
