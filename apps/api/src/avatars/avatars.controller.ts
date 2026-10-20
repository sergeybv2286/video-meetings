import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard.js';
import { AvatarSizeGuard } from './avatar-size.guard.js';
import { AvatarUploadFilter } from './avatar-upload.filter.js';
import { AVATAR_MAX_SIZE } from './avatar.validator.js';
import { AvatarsService } from './avatars.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class AvatarsController {
  constructor(private readonly avatars: AvatarsService) {}

  @Put('me/avatar')
  @UseGuards(AvatarSizeGuard)
  @UseFilters(AvatarUploadFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { files: 1, fields: 0, fileSize: AVATAR_MAX_SIZE },
    }),
  )
  put(@Req() req: AuthRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не передан');
    return this.avatars.put(req.user.id, file.buffer);
  }

  @Delete('me/avatar')
  @HttpCode(204)
  remove(@Req() req: AuthRequest) {
    return this.avatars.remove(req.user.id);
  }

  @Get(':id/avatar')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, mimeType, size } = await this.avatars.openForRead(id);
    res.set('X-Content-Type-Options', 'nosniff');
    // Аватар меняется, поэтому кеш только приватный и с перепроверкой.
    res.set('Cache-Control', 'private, no-cache');
    return new StreamableFile(stream, { type: mimeType, length: size });
  }
}
