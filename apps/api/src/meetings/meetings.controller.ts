import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMeetingDto } from './meetings.dto.js';
import { MeetingsService } from './meetings.service.js';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    const meetings = this.meetings.findByOwner(req.user.id);
    const withFile = await this.meetingIdsWithFile(meetings.map((m) => m.id));
    return meetings.map((meeting) => ({
      ...meeting,
      hasFile: withFile.has(meeting.id),
    }));
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateMeetingDto) {
    return { ...this.meetings.create(req.user.id, dto), hasFile: false };
  }

  @Get(':id')
  async findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    const meeting = this.meetings.findOneByOwner(req.user.id, id);
    if (!meeting) throw new NotFoundException('Встреча не найдена');
    const withFile = await this.meetingIdsWithFile([meeting.id]);
    return { ...meeting, hasFile: withFile.has(meeting.id) };
  }

  /** Один запрос на весь список; `meeting_files` связана со встречей только по `meetingId`. */
  private async meetingIdsWithFile(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const files = await this.prisma.meetingFile.findMany({
      where: { meetingId: { in: ids } },
      select: { meetingId: true },
    });
    return new Set(files.map((file) => file.meetingId));
  }
}
