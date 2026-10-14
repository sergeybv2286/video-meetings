import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
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

  /** Встреча пользователя по id; чужие встречи не видны. */
  findOneByOwner(ownerId: string, id: string): Meeting | undefined {
    return this.meetings.find(
      (meeting) => meeting.id === id && meeting.ownerId === ownerId,
    );
  }

  /** Есть ли встреча (у любого владельца). */
  exists(id: string): boolean {
    return this.meetings.some((meeting) => meeting.id === id);
  }

  create(
    ownerId: string,
    input: { title: string; date?: string; participants?: string[] },
  ): Meeting {
    const createdAt = new Date().toISOString();
    const meeting: Meeting = {
      id: randomUUID(),
      title: input.title.trim(),
      date: input.date ? new Date(input.date).toISOString() : createdAt,
      participants: (input.participants ?? []).map((p) => p.trim()),
      ownerId,
      createdAt,
    };
    this.meetings.push(meeting);
    return meeting;
  }
}
