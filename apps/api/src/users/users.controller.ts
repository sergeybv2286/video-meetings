import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthTokenService } from '../auth/auth-token.service.js';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard.js';
import { AUTH_THROTTLE } from '../auth/rate-limit.js';
import {
  ChangePasswordDto,
  DeleteAccountDto,
  SearchUsersDto,
  UpdateProfileDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: AuthTokenService,
  ) {}

  @Get()
  search(@Query() { search }: SearchUsersDto) {
    return this.users.search(search);
  }

  @Get('me')
  me(@Req() req: AuthRequest) {
    return this.users.getProfile(req.user.id);
  }

  @Patch('me')
  @Throttle(AUTH_THROTTLE)
  updateMe(@Req() req: AuthRequest, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(req.user.id, dto);
  }

  /** Старые токены после смены пароля недействительны, поэтому в ответе — новый токен. */
  @Put('me/password')
  @Throttle(AUTH_THROTTLE)
  async changePassword(
    @Req() req: AuthRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    const user = await this.users.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    return this.tokens.issue(user.id, user.email, user.tokenVersion);
  }

  @Delete('me')
  @HttpCode(204)
  @Throttle(AUTH_THROTTLE)
  deleteMe(@Req() req: AuthRequest, @Body() dto: DeleteAccountDto) {
    return this.users.remove(req.user.id, dto.password);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getPublicProfile(id);
  }
}
