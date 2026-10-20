import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { Prisma, type UserAvatar } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { getAvatarStorageDir, resolveAvatarPath } from './avatar.config.js';
import { detectAvatarMime } from './avatar.validator.js';

export interface AvatarDto {
  mimeType: string;
  size: number;
  updatedAt: Date;
}

function toDto({ mimeType, size, updatedAt }: UserAvatar): AvatarDto {
  return { mimeType, size, updatedAt };
}

@Injectable()
export class AvatarsService {
  private readonly logger = new Logger(AvatarsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Загружает или заменяет аватар. Новый файл пишется под новым именем, затем обновляется
   * запись и только потом удаляется старый файл: при любом сбое прежний аватар остаётся.
   */
  async put(userId: string, content: Buffer): Promise<AvatarDto> {
    if (content.length === 0) throw new BadRequestException('Файл пустой');
    const mimeType = await detectAvatarMime(content);
    const storageKey = randomUUID();
    await mkdir(getAvatarStorageDir(), { recursive: true });
    await writeFile(resolveAvatarPath(storageKey), content, {
      flag: 'wx',
      mode: 0o600,
    });
    try {
      const previous = await this.prisma.userAvatar.findUnique({
        where: { userId },
      });
      const saved = await this.prisma.userAvatar.upsert({
        where: { userId },
        create: { userId, mimeType, size: content.length, storageKey },
        update: { mimeType, size: content.length, storageKey },
      });
      if (previous) await this.removeFromDisk(previous.storageKey);
      return toDto(saved);
    } catch (error) {
      await this.removeFromDisk(storageKey);
      // Токен ещё действует, а пользователя уже удалили.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Пользователь не найден');
      }
      throw error;
    }
  }

  /** Открывает файл аватара; 404, если аватара нет или файл пропал с диска. */
  async openForRead(
    userId: string,
  ): Promise<{ stream: ReadStream; mimeType: string; size: number }> {
    const avatar = await this.prisma.userAvatar.findUnique({
      where: { userId },
    });
    if (!avatar) throw new NotFoundException('Аватар не найден');
    const fullPath = resolveAvatarPath(avatar.storageKey);
    let size: number;
    try {
      size = (await stat(fullPath)).size;
    } catch {
      this.logger.error(
        `Файл аватара ${avatar.storageKey} отсутствует на диске`,
      );
      throw new NotFoundException('Аватар не найден');
    }
    return {
      stream: createReadStream(fullPath),
      mimeType: avatar.mimeType,
      size,
    };
  }

  /** Удаляет запись и файл; 404, если аватара нет. Сбой удаления с диска только логируется. */
  async remove(userId: string): Promise<void> {
    const avatar = await this.prisma.userAvatar.findUnique({
      where: { userId },
    });
    if (!avatar) throw new NotFoundException('Аватар не найден');
    const { count } = await this.prisma.userAvatar.deleteMany({
      where: { id: avatar.id },
    });
    if (count === 0) throw new NotFoundException('Аватар не найден');
    await this.removeFromDisk(avatar.storageKey);
  }

  /** Сбой удаления не должен перекрывать исходную ошибку. */
  private async removeFromDisk(storageKey: string): Promise<void> {
    try {
      await rm(resolveAvatarPath(storageKey), { force: true });
    } catch (error) {
      this.logger.error(`Не удалось удалить файл аватара ${storageKey}`, error);
    }
  }
}
