import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  /** Пустая строка сбрасывает имя. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  /** Текущий пароль: обязателен, если email меняется. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword: string;
}

export class DeleteAccountDto {
  @IsString()
  @MaxLength(128)
  password: string;
}

export class SearchUsersDto {
  /** Не короче 3 символов: короткие запросы позволили бы выгрузить всех пользователей. */
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  search: string;
}
