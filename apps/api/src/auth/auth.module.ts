import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthTokenService } from './auth-token.service.js';
import { RegisterUserHandler } from './commands/register-user.handler.js';
import { LoginHandler } from './queries/login.handler.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { getJwtSecret } from './jwt-secret.js';

@Global()
@Module({
  imports: [
    CqrsModule,
    UsersModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d', algorithm: 'HS256' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthTokenService,
    RegisterUserHandler,
    LoginHandler,
    JwtAuthGuard,
  ],
  exports: [JwtModule, JwtAuthGuard, AuthTokenService],
})
export class AuthModule {}
