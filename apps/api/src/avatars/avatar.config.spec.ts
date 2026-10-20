import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getAvatarStorageDir, resolveAvatarPath } from './avatar.config.js';

describe('avatar.config', () => {
  afterEach(() => {
    delete process.env.AVATARS_STORAGE_DIR;
  });

  it('по умолчанию использует ./storage/avatars', () => {
    expect(getAvatarStorageDir()).toBe(path.resolve('./storage/avatars'));
  });

  it('берёт каталог из AVATARS_STORAGE_DIR', () => {
    process.env.AVATARS_STORAGE_DIR = '/tmp/avatars-test';
    expect(getAvatarStorageDir()).toBe('/tmp/avatars-test');
  });

  it('резолвит ключ внутри каталога', () => {
    process.env.AVATARS_STORAGE_DIR = '/tmp/avatars-test';
    expect(resolveAvatarPath('abc')).toBe('/tmp/avatars-test/abc');
  });

  it('отклоняет ключ за пределами каталога', () => {
    process.env.AVATARS_STORAGE_DIR = '/tmp/avatars-test';
    expect(() => resolveAvatarPath('../evil')).toThrow();
  });
});
