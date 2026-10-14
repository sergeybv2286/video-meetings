import { Module } from '@nestjs/common';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { MeetingFileAbsentGuard } from './meeting-file-absent.guard.js';
import { MeetingFileSizeGuard } from './meeting-file-size.guard.js';
import { MeetingFilesCleanupService } from './meeting-files-cleanup.service.js';
import { MeetingFilesController } from './meeting-files.controller.js';
import { MeetingFilesService } from './meeting-files.service.js';
import { MeetingOwnerGuard } from './meeting-owner.guard.js';

@Module({
  imports: [MeetingsModule],
  controllers: [MeetingFilesController],
  providers: [
    MeetingFilesService,
    MeetingFilesCleanupService,
    MeetingOwnerGuard,
    MeetingFileAbsentGuard,
    MeetingFileSizeGuard,
  ],
})
export class MeetingFilesModule {}
