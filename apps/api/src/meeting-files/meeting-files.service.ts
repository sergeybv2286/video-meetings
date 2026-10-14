import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import type { ReadStream } from 'node:fs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveStoragePath } from './meeting-file.config.js';
import type { StoredFileInfo } from './meeting-file.storage.js';
import { toMeetingFileDto, type MeetingFileDto } from './meeting-files.dto.js';

@Injectable()
export class MeetingFilesService {
  private readonly logger = new Logger(MeetingFilesService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      return toMeetingFileDto(created);
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

  async findByMeeting(meetingId: string): Promise<MeetingFileDto> {
    const file = await this.prisma.meetingFile.findUnique({
      where: { meetingId },
    });
    if (!file) throw new NotFoundException('Файл не найден');
    return toMeetingFileDto(file);
  }

  /** Открывает файл на чтение; 404, если записи нет или файл пропал с диска. */
  async openForDownload(
    meetingId: string,
  ): Promise<{
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

  async exists(meetingId: string): Promise<boolean> {
    const count = await this.prisma.meetingFile.count({ where: { meetingId } });
    return count > 0;
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
