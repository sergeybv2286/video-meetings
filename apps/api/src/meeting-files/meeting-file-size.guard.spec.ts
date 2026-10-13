import {
  type ExecutionContext,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MeetingFileSizeGuard } from './meeting-file-size.guard.js';

describe('MeetingFileSizeGuard', () => {
  const guard = new MeetingFileSizeGuard();
  const ctx = (contentLength?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'content-length': contentLength } }),
      }),
    }) as unknown as ExecutionContext;

  afterEach(() => {
    delete process.env.MEETING_FILE_MAX_SIZE;
  });

  it('пропускает запрос в пределах лимита и без Content-Length', () => {
    expect(guard.canActivate(ctx('1000'))).toBe(true);
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });

  it('отклоняет запрос больше лимита (413) с русским сообщением', () => {
    process.env.MEETING_FILE_MAX_SIZE = '1000';
    expect(() => guard.canActivate(ctx(String(5 * 1024 * 1024)))).toThrow(
      PayloadTooLargeException,
    );
    expect(() => guard.canActivate(ctx(String(5 * 1024 * 1024)))).toThrow(
      /Файл слишком большой/,
    );
  });
});
