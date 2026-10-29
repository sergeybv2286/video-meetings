import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { DEFAULT_THROTTLE } from './auth/rate-limit.js';
import { AvatarsModule } from './avatars/avatars.module.js';
import { MeetingFilesModule } from './meeting-files/meeting-files.module.js';
import { MeetingsModule } from './meetings/meetings.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([DEFAULT_THROTTLE]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AvatarsModule,
    MeetingsModule,
    MeetingFilesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
