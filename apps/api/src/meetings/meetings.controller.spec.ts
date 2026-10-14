import { NotFoundException } from '@nestjs/common';
import type { AuthRequest } from '../auth/jwt-auth.guard.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MeetingsController } from './meetings.controller.js';
import { MeetingsService } from './meetings.service.js';

describe('MeetingsController: признак hasFile', () => {
  const req = { user: { id: 'u1' } } as unknown as AuthRequest;
  let meetings: MeetingsService;

  const makeController = (fileMeetingIds: string[]) => {
    const findMany = vi
      .fn()
      .mockResolvedValue(fileMeetingIds.map((meetingId) => ({ meetingId })));
    const controller = new MeetingsController(meetings, {
      meetingFile: { findMany },
    } as unknown as PrismaService);
    return { controller, findMany };
  };

  beforeEach(() => {
    meetings = new MeetingsService();
  });

  it('список: hasFile true только у встреч с файлом, один запрос в БД', async () => {
    const a = meetings.create('u1', { title: 'A' });
    const b = meetings.create('u1', { title: 'B' });
    const { controller, findMany } = makeController([a.id]);

    const list = await controller.list(req);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(list.find((m) => m.id === a.id)?.hasFile).toBe(true);
    expect(list.find((m) => m.id === b.id)?.hasFile).toBe(false);
  });

  it('пустой список: запрос в БД не выполняется', async () => {
    const { controller, findMany } = makeController([]);

    expect(await controller.list(req)).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('детали: hasFile отражает наличие файла', async () => {
    const m = meetings.create('u1', { title: 'A' });

    expect(
      (await makeController([m.id]).controller.findOne(req, m.id)).hasFile,
    ).toBe(true);
    expect(
      (await makeController([]).controller.findOne(req, m.id)).hasFile,
    ).toBe(false);
  });

  it('детали: 404 для чужой встречи', async () => {
    const m = meetings.create('u2', { title: 'A' });

    await expect(
      makeController([]).controller.findOne(req, m.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('создание: hasFile false', () => {
    expect(
      makeController([]).controller.create(req, { title: 'A' }).hasFile,
    ).toBe(false);
  });
});
