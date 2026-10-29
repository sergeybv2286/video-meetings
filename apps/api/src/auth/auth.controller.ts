import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import { RegisterUserCommand } from './commands/register-user.command.js';
import { LoginQuery } from './queries/login.query.js';
import type { AuthResult } from './auth-token.service.js';
import { CredentialsDto } from './auth.dto.js';
import { JwtAuthGuard, type AuthRequest } from './jwt-auth.guard.js';
import { AUTH_THROTTLE } from './rate-limit.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  register(@Body() dto: CredentialsDto) {
    return this.commandBus.execute<RegisterUserCommand, AuthResult>(
      new RegisterUserCommand(dto.email, dto.password),
    );
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  login(@Body() dto: CredentialsDto) {
    return this.queryBus.execute<LoginQuery, AuthResult>(
      new LoginQuery(dto.email, dto.password),
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthRequest) {
    return req.user;
  }
}
