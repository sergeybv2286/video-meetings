import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  private readonly users: User[] = [];

  findByEmail(email: string): User | undefined {
    const normalized = email.trim().toLowerCase();
    return this.users.find((user) => user.email === normalized);
  }

  create(email: string, passwordHash: string): User {
    const user: User = {
      id: randomUUID(),
      email: email.trim().toLowerCase(),
      passwordHash,
    };
    this.users.push(user);
    return user;
  }
}
