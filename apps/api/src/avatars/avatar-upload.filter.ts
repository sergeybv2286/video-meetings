import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

export const AVATAR_TOO_LARGE_MESSAGE =
  'Файл слишком большой. Максимальный размер аватара — 5 МБ';

/** Английские сообщения multer/Nest при разборе multipart → русские. */
function translate(exception: HttpException): HttpException {
  const message = exception.message;
  if (
    exception instanceof PayloadTooLargeException &&
    message === 'File too large'
  ) {
    return new PayloadTooLargeException(AVATAR_TOO_LARGE_MESSAGE);
  }
  if (exception instanceof BadRequestException) {
    if (/Unexpected field|Too many (files|fields|parts)/i.test(message)) {
      return new BadRequestException(
        'Некорректный запрос: передайте один файл в поле «file»',
      );
    }
    if (/Unexpected end of form|Multipart|Malformed|Boundary/i.test(message)) {
      return new BadRequestException('Некорректный запрос загрузки файла');
    }
  }
  return exception;
}

@Catch(HttpException)
export class AvatarUploadFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const result = translate(exception);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(result.getStatus())
      .json(
        result === exception
          ? exception.getResponse()
          : { statusCode: result.getStatus(), message: result.message },
      );
  }
}
