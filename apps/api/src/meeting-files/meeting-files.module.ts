import { Module } from '@nestjs/common';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { MeetingFilesController } from './meeting-files.controller.js';
import { MeetingFilesService } from './meeting-files.service.js';
import { MeetingOwnerGuard } from './meeting-owner.guard.js';

@Module({
  imports: [MeetingsModule],
  controllers: [MeetingFilesController],
  providers: [MeetingFilesService, MeetingOwnerGuard],
})
export class MeetingFilesModule {}
