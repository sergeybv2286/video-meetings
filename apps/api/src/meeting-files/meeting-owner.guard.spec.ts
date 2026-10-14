import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { MeetingsService } from '../meetings/meetings.service.js';
import { MeetingOwnerGuard } from './meeting-owner.guard.js';

describe('MeetingOwnerGuard', () => {
  const contextFor = (userId: string, meetingId: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: userId }, params: { id: meetingId } }),
      }),
    }) as unknown as ExecutionContext;

  const guardWith = (found: boolean) => {
    const findOneByOwner = vi.fn().mockReturnValue(found ? {} : undefined);
    const guard = new MeetingOwnerGuard({
      findOneByOwner,
    } as unknown as MeetingsService);
    return { guard, findOneByOwner };
  };

  it('пропускает владельца встречи', () => {
    const { guard, findOneByOwner } = guardWith(true);
    expect(guard.canActivate(contextFor('u1', 'm1'))).toBe(true);
    expect(findOneByOwner).toHaveBeenCalledWith('u1', 'm1');
  });

  it('404, если встречи нет или она чужая', () => {
    const { guard } = guardWith(false);
    expect(() => guard.canActivate(contextFor('u1', 'm1'))).toThrow(
      NotFoundException,
    );
  });
});
