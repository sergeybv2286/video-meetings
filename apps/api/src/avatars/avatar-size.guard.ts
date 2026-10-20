import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AVATAR_TOO_LARGE_MESSAGE } from './avatar-upload.filter.js';
import { AVATAR_MAX_SIZE } from './avatar.validator.js';

/** Запас на multipart-обвязку сверх лимита файла. */
const MULTIPART_OVERHEAD = 64 * 1024;

/** Отклоняет заведомо слишком большой запрос по `Content-Length` до чтения тела. */
@Injectable()
export class AvatarSizeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const length = Number(req.headers['content-length']);
    if (
      Number.isFinite(length) &&
      length > AVATAR_MAX_SIZE + MULTIPART_OVERHEAD
    ) {
      throw new PayloadTooLargeException(AVATAR_TOO_LARGE_MESSAGE);
    }
    return true;
  }
}
