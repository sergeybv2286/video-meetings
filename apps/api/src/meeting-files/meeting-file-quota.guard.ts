import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/jwt-auth.guard.js';
import { MeetingsService } from '../meetings/meetings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Суммарный размер файлов одного пользователя: 5 ГБ (`USER_FILES_QUOTA` в байтах переопределяет). */
export const DEFAULT_USER_QUOTA = 5 * 1024 * 1024 * 1024;

export function getUserQuota(): number {
  const value = Number(process.env.USER_FILES_QUOTA);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_USER_QUOTA;
}

/**
 * Отказывает (413), если загрузка превысит квоту пользователя на хранилище. Выполняется до
 * чтения тела, размер берётся из `Content-Length`; при замене файл той же встречи не учитывается.
 */
@Injectable()
export class MeetingFileQuotaGuard implements CanActivate {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<AuthRequest & { params: { id: string } }>();
    const meetingIds = this.meetings
      .findByOwner(req.user.id)
      .map((meeting) => meeting.id)
      .filter((id) => id !== req.params.id);
    const { _sum } = await this.prisma.meetingFile.aggregate({
      where: { meetingId: { in: meetingIds } },
      _sum: { size: true },
    });
    const incoming = Number(req.headers['content-length']);
    const total = (_sum.size ?? 0) + (Number.isFinite(incoming) ? incoming : 0);
    if (total > getUserQuota()) {
      throw new PayloadTooLargeException(
        `Превышена квота хранилища — ${Math.round(getUserQuota() / 1024 / 1024 / 1024)} ГБ. Удалите ненужные файлы`,
      );
    }
    return true;
  }
}
