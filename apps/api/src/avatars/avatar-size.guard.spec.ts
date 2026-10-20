import {
  type ExecutionContext,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AvatarSizeGuard } from './avatar-size.guard.js';
import { AVATAR_MAX_SIZE } from './avatar.validator.js';

describe('AvatarSizeGuard', () => {
  const guard = new AvatarSizeGuard();
  const ctx = (contentLength?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'content-length': contentLength } }),
      }),
    }) as unknown as ExecutionContext;

  it('пропускает запрос в пределах лимита и без Content-Length', () => {
    expect(guard.canActivate(ctx('1000'))).toBe(true);
    expect(guard.canActivate(ctx(String(AVATAR_MAX_SIZE)))).toBe(true);
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });

  it('отклоняет запрос больше лимита (413) с русским сообщением', () => {
    const tooLarge = String(AVATAR_MAX_SIZE + 1024 * 1024);
    expect(() => guard.canActivate(ctx(tooLarge))).toThrow(
      PayloadTooLargeException,
    );
    expect(() => guard.canActivate(ctx(tooLarge))).toThrow(/слишком большой/);
  });
});
