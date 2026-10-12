import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveStoragePath } from './meeting-file.config.js';
import type { StoredFileInfo } from './meeting-file.storage.js';
import { toMeetingFileDto, type MeetingFileDto } from './meeting-files.dto.js';

@Injectable()
export class MeetingFilesService {
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
      await rm(resolveStoragePath(file.storageKey), { force: true });
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
}
