import { describe, expect, it } from 'vitest';
import { AVATAR_ACCEPT, MAX_AVATAR_SIZE, validateAvatar } from './avatar-file';

describe('validateAvatar', () => {
  it.each([
    ['image/jpeg', 'a.jpg'],
    ['image/png', 'a.png'],
    ['image/webp', 'a.webp'],
  ])('пропускает %s', (type, name) => {
    expect(validateAvatar({ name, type, size: 100 })).toBeNull();
  });

  it('отклоняет недопустимый тип по-русски', () => {
    expect(
      validateAvatar({ name: 'a.gif', type: 'image/gif', size: 100 }),
    ).toBe('Формат не поддерживается. Допустимые форматы: JPEG, PNG, WebP');
  });

  it('отклоняет пустой файл', () => {
    expect(validateAvatar({ name: 'a.png', type: 'image/png', size: 0 })).toBe(
      'Файл пустой',
    );
  });

  it('отклоняет файл больше 5 МБ, ровно 5 МБ допустимо', () => {
    expect(MAX_AVATAR_SIZE).toBe(5 * 1024 * 1024);
    expect(
      validateAvatar({
        name: 'a.png',
        type: 'image/png',
        size: MAX_AVATAR_SIZE + 1,
      }),
    ).toBe('Файл слишком большой. Максимальный размер — 5 МБ');
    expect(
      validateAvatar({
        name: 'a.png',
        type: 'image/png',
        size: MAX_AVATAR_SIZE,
      }),
    ).toBeNull();
  });

  it('accept ограничен изображениями', () => {
    expect(AVATAR_ACCEPT).toBe('image/jpeg,image/png,image/webp');
  });
});
