import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { MeetingsService } from '../meetings/meetings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  FILES_SUBDIR,
  getStorageDir,
  resolveStoragePath,
  TMP_SUBDIR,
} from './meeting-file.config.js';

/** Файлы создаёт только сервер под именем `<uuid>`; чужие файлы в каталогах не трогаем. */
const SERVER_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface CleanupResult {
  /** Записи `MeetingFile`, у которых нет встречи. */
  orphanRecords: number;
  /** Файлы в `files/` без записи в БД. */
  orphanFiles: number;
  /** Недозагруженные файлы в `tmp/`. */
  tmpFiles: number;
}

/**
 * Встречи живут в памяти, а файлы и метаданные — в Postgres и на диске, поэтому после
 * перезапуска API они остаются без встречи. Очистка при старте приводит всё в согласованное
 * состояние: удаляет записи без встречи, файлы без записи и хвосты `tmp/`.
 * Выполняется до `listen`, так что активных загрузок в этот момент нет.
 */
@Injectable()
export class MeetingFilesCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MeetingFilesCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meetings: MeetingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await this.cleanup();
      if (result.orphanRecords || result.orphanFiles || result.tmpFiles) {
        this.logger.log(
          `Очистка: записей без встречи — ${result.orphanRecords}, файлов без записи — ${result.orphanFiles}, хвостов tmp — ${result.tmpFiles}`,
        );
      }
    } catch (error) {
      // Сбой очистки не должен мешать запуску API.
      this.logger.error('Не удалось выполнить очистку файлов встреч', error);
    }
  }

  async cleanup(): Promise<CleanupResult> {
    const orphanRecords = await this.removeRecordsWithoutMeeting();
    const orphanFiles = await this.removeFilesWithoutRecord();
    const tmpFiles = await this.removeDir(TMP_SUBDIR);
    return { orphanRecords, orphanFiles, tmpFiles };
  }

  private async removeRecordsWithoutMeeting(): Promise<number> {
    const records = await this.prisma.meetingFile.findMany({
      select: { id: true, meetingId: true, storageKey: true },
    });
    let removed = 0;
    for (const record of records) {
      if (this.meetings.exists(record.meetingId)) continue;
      await this.prisma.meetingFile.deleteMany({ where: { id: record.id } });
      await this.removeFile(record.storageKey);
      removed++;
    }
    return removed;
  }

  private async removeFilesWithoutRecord(): Promise<number> {
    const known = new Set(
      (
        await this.prisma.meetingFile.findMany({ select: { storageKey: true } })
      ).map((record) => record.storageKey),
    );
    let removed = 0;
    for (const name of await this.listServerFiles(FILES_SUBDIR)) {
      const key = `${FILES_SUBDIR}/${name}`;
      if (known.has(key)) continue;
      if (await this.removeFile(key)) removed++;
    }
    return removed;
  }

  private async removeDir(subdir: string): Promise<number> {
    let removed = 0;
    for (const name of await this.listServerFiles(subdir)) {
      if (await this.removeFile(`${subdir}/${name}`)) removed++;
    }
    return removed;
  }

  private async listServerFiles(subdir: string): Promise<string[]> {
    try {
      const names = await readdir(path.join(getStorageDir(), subdir));
      return names.filter((name) => SERVER_FILE_NAME.test(name));
    } catch {
      return [];
    }
  }

  private async removeFile(storageKey: string): Promise<boolean> {
    try {
      await rm(resolveStoragePath(storageKey), { force: true });
      return true;
    } catch (error) {
      this.logger.error(`Не удалось удалить файл ${storageKey}`, error);
      return false;
    }
  }
}
