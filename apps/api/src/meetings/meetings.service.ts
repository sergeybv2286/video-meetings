import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface Meeting {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
}

@Injectable()
export class MeetingsService {
  private readonly meetings: Meeting[] = [];

  /** Все встречи пользователя, новые первыми. */
  findByOwner(ownerId: string): Meeting[] {
    return this.meetings
      .filter((meeting) => meeting.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  create(ownerId: string, title: string): Meeting {
    const meeting: Meeting = {
      id: randomUUID(),
      title: title.trim(),
      ownerId,
      createdAt: new Date().toISOString(),
    };
    this.meetings.push(meeting);
    return meeting;
  }
}
