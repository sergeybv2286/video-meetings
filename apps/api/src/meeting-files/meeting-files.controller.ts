import {
  BadRequestException,
  Controller,
  Get,
  Param,
  StreamableFile,
  Post,
  Put,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  MeetingFileStorage,
  type StoredFileInfo,
} from './meeting-file.storage.js';
import { attachmentDisposition } from './content-disposition.js';
import { MAX_FILE_SIZE_CAP } from './meeting-file.types.js';
import { MeetingFileSizeGuard } from './meeting-file-size.guard.js';
import { MeetingFileUploadFilter } from './meeting-file-upload.filter.js';
import { MeetingFileAbsentGuard } from './meeting-file-absent.guard.js';
import { MeetingFilesService } from './meeting-files.service.js';
import { MeetingOwnerGuard } from './meeting-owner.guard.js';

function fileUploadOptions() {
  return {
    storage: new MeetingFileStorage(),
    limits: { files: 1, fields: 0, fileSize: MAX_FILE_SIZE_CAP },
    // Исходные имена приходят в UTF-8 (кириллица и т. п.).
    defParamCharset: 'utf8' as const,
  };
}

@Controller('meetings/:id/file')
@UseGuards(JwtAuthGuard, MeetingOwnerGuard)
export class MeetingFilesController {
  constructor(private readonly files: MeetingFilesService) {}

  @Post()
  @UseGuards(MeetingFileAbsentGuard, MeetingFileSizeGuard)
  @UseFilters(MeetingFileUploadFilter)
  @UseInterceptors(FileInterceptor('file', fileUploadOptions()))
  upload(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File & StoredFileInfo,
  ) {
    if (!file) throw new BadRequestException('Файл не передан');
    return this.files.create(id, file);
  }

  @Put()
  @UseGuards(MeetingFileSizeGuard)
  @UseFilters(MeetingFileUploadFilter)
  @UseInterceptors(FileInterceptor('file', fileUploadOptions()))
  replace(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File & StoredFileInfo,
  ) {
    if (!file) throw new BadRequestException('Файл не передан');
    return this.files.replace(id, file);
  }

  @Get()
  info(@Param('id') id: string) {
    return this.files.findByMeeting(id);
  }

  @Get('download')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, fileName, mimeType, size } =
      await this.files.openForDownload(id);
    // Файл отдаётся только как вложение и без угадывания типа браузером.
    res.set('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: attachmentDisposition(fileName),
      length: size,
    });
  }
}
