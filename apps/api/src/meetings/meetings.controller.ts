import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard.js';
import { CreateMeetingDto } from './meetings.dto.js';
import { MeetingsService } from './meetings.service.js';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.meetings.findByOwner(req.user.id);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(req.user.id, dto.title);
  }
}
