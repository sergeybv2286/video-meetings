import { UnauthorizedException } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { UsersService } from '../../users/users.service.js';
import { AuthTokenService, type AuthResult } from '../auth-token.service.js';
import { verifyPassword } from '../password.js';
import { LoginQuery } from './login.query.js';

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<LoginQuery, AuthResult> {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: AuthTokenService,
  ) {}

  async execute({ email, password }: LoginQuery): Promise<AuthResult> {
    const user = await this.users.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    return this.tokens.issue(user.id, user.email);
  }
}
