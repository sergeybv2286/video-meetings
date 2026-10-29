import {
  PayloadTooLargeException,
  type ExecutionContext,
} from '@nestjs/common';
import type { MeetingsService } from '../meetings/meetings.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MeetingFileQuotaGuard } from './meeting-file-quota.guard.js';

describe('MeetingFileQuotaGuard', () => {
  const MB = 1024 * 1024;

  const run = (used: number | null, contentLength?: string) => {
    const aggregate = vi.fn().mockResolvedValue({ _sum: { size: used } });
    const guard = new MeetingFileQuotaGuard(
      {
        findByOwner: () => [{ id: 'm1' }, { id: 'm2' }],
      } as unknown as MeetingsService,
      { meetingFile: { aggregate } } as unknown as PrismaService,
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1' },
          params: { id: 'm1' },
          headers: { 'content-length': contentLength },
        }),
      }),
    } as unknown as ExecutionContext;
    return { result: guard.canActivate(context), aggregate };
  };

  beforeEach(() => vi.stubEnv('USER_FILES_QUOTA', String(100 * MB)));
  afterEach(() => vi.unstubAllEnvs());

  it('пропускает, пока суммарный размер в пределах квоты', async () => {
    await expect(run(40 * MB, String(50 * MB)).result).resolves.toBe(true);
  });

  it('пропускает без Content-Length и без загруженных файлов', async () => {
    await expect(run(null).result).resolves.toBe(true);
  });

  it('413, если загрузка превысит квоту', async () => {
    await expect(run(80 * MB, String(30 * MB)).result).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('файл заменяемой встречи в сумму не входит', async () => {
    const { aggregate, result } = run(0, String(MB));
    await result;
    expect(aggregate.mock.calls[0][0].where.meetingId.in).toEqual(['m2']);
  });
});
