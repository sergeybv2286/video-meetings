import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvatarsService } from '../avatars/avatars.service.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import type { UpdateProfileDto } from './users.dto.js';

export type { User };

/** Публичное представление пользователя: без хеша пароля. */
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  hasAvatar: boolean;
  /** Время последнего изменения аватара (для сброса кэша); `null`, если аватара нет. */
  avatarUpdatedAt: Date | null;
}

type UserWithAvatar = User & { avatar: { updatedAt: Date } | null };

const WITH_AVATAR = { avatar: { select: { updatedAt: true } } } as const;

const SEARCH_LIMIT = 20;

export function toProfile(user: UserWithAvatar): UserProfile {
  const { id, email, name, createdAt, avatar } = user;
  return {
    id,
    email,
    name,
    createdAt,
    hasAvatar: avatar !== null,
    avatarUpdatedAt: avatar?.updatedAt ?? null,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: AvatarsService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: normalize(email) } });
  }

  create(email: string, passwordHash: string): Promise<User> {
    return this.prisma.user.create({
      data: { email: normalize(email), passwordHash },
    });
  }

  async getProfile(id: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: WITH_AVATAR,
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return toProfile(user);
  }

  /** Поиск по части email или имени (без учёта регистра), для приглашения участников. */
  async search(query?: string): Promise<UserProfile[]> {
    const term = query?.trim();
    const users = await this.prisma.user.findMany({
      where: term
        ? {
            OR: [
              { email: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: WITH_AVATAR,
      orderBy: { email: 'asc' },
      take: SEARCH_LIMIT,
    });
    return users.map(toProfile);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.email !== undefined) data.email = normalize(dto.email);
    if (dto.name !== undefined) data.name = dto.name.trim() || null;
    try {
      return toProfile(
        await this.prisma.user.update({
          where: { id },
          data,
          include: WITH_AVATAR,
        }),
      );
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.getOrFail(id);
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new BadRequestException('Неверный текущий пароль');
    }
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: hashPassword(newPassword) },
    });
  }

  async remove(id: string, password: string): Promise<void> {
    const user = await this.getOrFail(id);
    if (!verifyPassword(password, user.passwordHash)) {
      throw new BadRequestException('Неверный пароль');
    }
    const avatar = await this.prisma.userAvatar.findUnique({
      where: { userId: id },
    });
    await this.prisma.user.delete({ where: { id } });
    // Запись аватара удалена каскадом; файл чистим после удаления аккаунта.
    if (avatar) await this.avatars.removeFromDisk(avatar.storageKey);
  }

  private async getOrFail(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function mapPrismaError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ConflictException('Пользователь с таким email уже существует');
    }
    if (error.code === 'P2025') {
      return new NotFoundException('Пользователь не найден');
    }
  }
  return error;
}
