import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMeetingDto {
  @IsString({ message: 'Название должно быть строкой' })
  @MinLength(1, { message: 'Название не может быть пустым' })
  @MaxLength(100, { message: 'Название не длиннее 100 символов' })
  title: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Дата должна быть в формате ISO 8601' })
  date?: string;

  @IsOptional()
  @IsArray({ message: 'Участники должны быть массивом' })
  @ArrayMaxSize(100, { message: 'Не более 100 участников' })
  @IsString({ each: true, message: 'Участник должен быть строкой' })
  @MinLength(1, { each: true, message: 'Имя участника не может быть пустым' })
  @MaxLength(100, {
    each: true,
    message: 'Имя участника не длиннее 100 символов',
  })
  participants?: string[];
}
