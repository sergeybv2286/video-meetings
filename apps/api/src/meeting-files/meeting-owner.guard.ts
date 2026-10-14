import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/jwt-auth.guard.js';
import { MeetingsService } from '../meetings/meetings.service.js';

/**
 * Пропускает только владельца встречи. Выполняется до разбора multipart,
 * поэтому для чужой/несуществующей встречи тело запроса не читается.
 */
@Injectable()
export class MeetingOwnerGuard implements CanActivate {
  constructor(private readonly meetings: MeetingsService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<AuthRequest & { params: { id: string } }>();
    if (!this.meetings.findOneByOwner(req.user.id, req.params.id)) {
      throw new NotFoundException('Встреча не найдена');
    }
    return true;
  }
}
