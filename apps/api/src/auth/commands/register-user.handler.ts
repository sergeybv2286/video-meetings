import { ConflictException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../generated/prisma/client.js';
import { UsersService } from '../../users/users.service.js';
import { AuthTokenService, type AuthResult } from '../auth-token.service.js';
import { hashPassword } from '../password.js';
import { RegisterUserCommand } from './register-user.command.js';

@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<
  RegisterUserCommand,
  AuthResult
> {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: AuthTokenService,
  ) {}

  async execute({ email, password }: RegisterUserCommand): Promise<AuthResult> {
    try {
      const user = await this.users.create(email, hashPassword(password));
      return await this.tokens.issue(user.id, user.email);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Пользователь с таким email уже существует',
        );
      }
      throw error;
    }
  }
}
