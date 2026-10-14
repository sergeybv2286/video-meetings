import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { MeetingFilesModule } from './meeting-files/meeting-files.module.js';
import { MeetingsModule } from './meetings/meetings.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    MeetingsModule,
    MeetingFilesModule,
  ],
})
export class AppModule {}
