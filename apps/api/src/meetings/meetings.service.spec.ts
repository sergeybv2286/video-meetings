import { ForbiddenException } from '@nestjs/common';
import { MAX_MEETINGS_PER_USER, MeetingsService } from './meetings.service.js';

describe('MeetingsService: лимит встреч', () => {
  it('403 после достижения лимита; у других пользователей лимит свой', () => {
    const service = new MeetingsService();
    for (let i = 0; i < MAX_MEETINGS_PER_USER; i++) {
      service.create('u1', { title: `Встреча ${i}` });
    }

    expect(() => service.create('u1', { title: 'Лишняя' })).toThrow(
      ForbiddenException,
    );
    expect(() => service.create('u2', { title: 'Первая' })).not.toThrow();
  });
});
