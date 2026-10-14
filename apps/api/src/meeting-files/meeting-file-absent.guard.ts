import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { MeetingFilesService } from './meeting-files.service.js';

/**
 * Отказывает (409) в загрузке, если у встречи уже есть файл. Выполняется до
 * разбора multipart, поэтому лишний файл на диск не пишется.
 */
@Injectable()
export class MeetingFileAbsentGuard implements CanActivate {
  constructor(private readonly files: MeetingFilesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ params: { id: string } }>();
    if (await this.files.exists(req.params.id)) {
      throw new ConflictException('Файл уже загружен для этой встречи');
    }
    return true;
  }
}
