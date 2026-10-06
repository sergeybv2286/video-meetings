import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { hashPassword, verifyPassword } from './password.js';

export interface AuthResult {
  accessToken: string;
  user: { id: string; email: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<AuthResult> {
    if (this.users.findByEmail(email)) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }
    const user = this.users.create(email, hashPassword(password));
    return this.issueToken(user.id, user.email);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = this.users.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    return this.issueToken(user.id, user.email);
  }

  private async issueToken(id: string, email: string): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync({ sub: id, email });
    return { accessToken, user: { id, email } };
  }
}
