import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  MeetingFileStorage,
  type StoredFileInfo,
} from './meeting-file.storage.js';
import { MeetingFileAbsentGuard } from './meeting-file-absent.guard.js';
import { MeetingFilesService } from './meeting-files.service.js';
import { MeetingOwnerGuard } from './meeting-owner.guard.js';

@Controller('meetings/:id/file')
@UseGuards(JwtAuthGuard, MeetingOwnerGuard)
export class MeetingFilesController {
  constructor(private readonly files: MeetingFilesService) {}

  @Post()
  @UseGuards(MeetingFileAbsentGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: new MeetingFileStorage(),
      limits: { files: 1, fields: 0 },
      // Исходные имена приходят в UTF-8 (кириллица и т. п.).
      defParamCharset: 'utf8',
    }),
  )
  upload(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File & StoredFileInfo,
  ) {
    if (!file) throw new BadRequestException('Файл не передан');
    return this.files.create(id, file);
  }

  @Get()
  info(@Param('id') id: string) {
    return this.files.findByMeeting(id);
  }
}
