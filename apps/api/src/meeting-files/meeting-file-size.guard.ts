import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { getMaxFileSize } from './meeting-file.types.js';

/** Запас на multipart-обвязку (boundary, заголовки части) сверх лимита файла. */
const MULTIPART_OVERHEAD = 1024 * 1024;

/** Отклоняет заведомо слишком большой запрос по `Content-Length` до чтения тела. */
@Injectable()
export class MeetingFileSizeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const length = Number(req.headers['content-length']);
    if (
      Number.isFinite(length) &&
      length > getMaxFileSize() + MULTIPART_OVERHEAD
    ) {
      throw new PayloadTooLargeException(
        `Файл слишком большой. Максимальный размер — ${Math.round(getMaxFileSize() / 1024 / 1024)} МБ`,
      );
    }
    return true;
  }
}
