import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MeetingsModule } from './meetings/meetings.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [AuthModule, UsersModule, MeetingsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
