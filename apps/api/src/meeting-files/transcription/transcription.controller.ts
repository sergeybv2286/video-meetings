import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { attachmentDisposition } from '../content-disposition.js';
import { MeetingOwnerGuard } from '../meeting-owner.guard.js';
import { RETRY_THROTTLE } from './transcription.config.js';
import { TranscriptionService } from './transcription.service.js';

@Controller('meetings/:id/file/transcription')
@UseGuards(JwtAuthGuard, MeetingOwnerGuard)
export class TranscriptionController {
  constructor(private readonly transcription: TranscriptionService) {}

  @Get()
  find(@Param('id') id: string) {
    return this.transcription.find(id);
  }

  @Get('download')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { text, fileName } = await this.transcription.getDownload(id);
    res.set('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(text, 'utf8'), {
      type: 'text/plain; charset=utf-8',
      disposition: attachmentDisposition(fileName),
    });
  }

  @Post('retry')
  @HttpCode(200)
  @Throttle(RETRY_THROTTLE)
  retry(@Param('id') id: string) {
    return this.transcription.retry(id);
  }
}
