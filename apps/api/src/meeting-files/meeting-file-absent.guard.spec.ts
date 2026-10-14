import { ConflictException, type ExecutionContext } from '@nestjs/common';
import { MeetingFileAbsentGuard } from './meeting-file-absent.guard.js';
import type { MeetingFilesService } from './meeting-files.service.js';

describe('MeetingFileAbsentGuard', () => {
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ params: { id: 'm1' } }) }),
  } as unknown as ExecutionContext;

  const guardWith = (exists: boolean) =>
    new MeetingFileAbsentGuard({
      exists: vi.fn().mockResolvedValue(exists),
    } as unknown as MeetingFilesService);

  it('пропускает, если у встречи нет файла', async () => {
    await expect(guardWith(false).canActivate(context)).resolves.toBe(true);
  });

  it('409, если файл уже есть', async () => {
    await expect(guardWith(true).canActivate(context)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
