import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';
import { getMaxFileSize } from './meeting-file.types.js';

/** Английские сообщения multer/Nest при разборе multipart → русские. */
function translate(exception: HttpException): HttpException {
  const message = exception.message;
  if (
    exception instanceof PayloadTooLargeException &&
    message === 'File too large'
  ) {
    return new PayloadTooLargeException(
      `Файл слишком большой. Максимальный размер — ${Math.round(getMaxFileSize() / 1024 / 1024)} МБ`,
    );
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
export class MeetingFileUploadFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const result = translate(exception);
    const body = result.getResponse();
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(result.getStatus())
      .json(
        typeof body === 'string'
          ? { statusCode: result.getStatus(), message: body }
          : { ...body, message: result.message },
      );
  }
}
