import { Module } from '@nestjs/common';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { MeetingFileAbsentGuard } from './meeting-file-absent.guard.js';
import { MeetingFileQuotaGuard } from './meeting-file-quota.guard.js';
import { MeetingFileSizeGuard } from './meeting-file-size.guard.js';
import { MeetingFilesCleanupService } from './meeting-files-cleanup.service.js';
import { MeetingFilesController } from './meeting-files.controller.js';
import { MeetingFilesService } from './meeting-files.service.js';
import { MeetingOwnerGuard } from './meeting-owner.guard.js';
import { TranscriptionController } from './transcription/transcription.controller.js';
import { TranscriptionService } from './transcription/transcription.service.js';
import { TranscriptionQueue } from './transcription/transcription-queue.js';
import {
  TranscriptionRunner,
  WhisperTranscriptionRunner,
} from './transcription/transcription-runner.js';

@Module({
  imports: [MeetingsModule],
  controllers: [MeetingFilesController, TranscriptionController],
  providers: [
    MeetingFilesService,
    MeetingFilesCleanupService,
    MeetingOwnerGuard,
    MeetingFileAbsentGuard,
    MeetingFileSizeGuard,
    MeetingFileQuotaGuard,
    TranscriptionQueue,
    TranscriptionService,
    { provide: TranscriptionRunner, useClass: WhisperTranscriptionRunner },
  ],
})
export class MeetingFilesModule {}
