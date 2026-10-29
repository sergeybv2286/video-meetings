import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AuthResult {
  accessToken: string;
  user: { id: string; email: string };
}

export interface TokenPayload {
  sub: string;
  /** Версия токенов пользователя (`User.tokenVersion`). */
  tv: number;
}

@Injectable()
export class AuthTokenService {
  constructor(private readonly jwt: JwtService) {}

  async issue(
    id: string,
    email: string,
    tokenVersion: number,
  ): Promise<AuthResult> {
    const payload: TokenPayload = { sub: id, tv: tokenVersion };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, user: { id, email } };
  }
}
