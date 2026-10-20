import { Module } from '@nestjs/common';
import { AvatarSizeGuard } from './avatar-size.guard.js';
import { AvatarsController } from './avatars.controller.js';
import { AvatarsService } from './avatars.service.js';

@Module({
  controllers: [AvatarsController],
  providers: [AvatarsService, AvatarSizeGuard],
  exports: [AvatarsService],
})
export class AvatarsModule {}
