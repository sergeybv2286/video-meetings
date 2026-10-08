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
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard.js';
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
  constructor(private readonly users: UsersService) {}

  @Get()
  search(@Query() { search }: SearchUsersDto) {
    return this.users.search(search);
  }

  @Get('me')
  me(@Req() req: AuthRequest) {
    return this.users.getProfile(req.user.id);
  }

  @Patch('me')
  updateMe(@Req() req: AuthRequest, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(req.user.id, dto);
  }

  @Put('me/password')
  @HttpCode(204)
  changePassword(@Req() req: AuthRequest, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Delete('me')
  @HttpCode(204)
  deleteMe(@Req() req: AuthRequest, @Body() dto: DeleteAccountDto) {
    return this.users.remove(req.user.id, dto.password);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getProfile(id);
  }
}
