import { describe, expect, it } from 'vitest';
import { getInitials } from './initials';

describe('getInitials', () => {
  it('берёт первые буквы двух слов имени в верхнем регистре', () => {
    expect(getInitials('иван петров', 'a@b.c')).toBe('ИП');
  });

  it('для одного слова возвращает одну букву', () => {
    expect(getInitials('Иван', 'a@b.c')).toBe('И');
  });

  it('учитывает только первые два слова и лишние пробелы', () => {
    expect(getInitials('  Иван   Петрович  Сидоров ', 'a@b.c')).toBe('ИП');
  });

  it('если имя не задано, берёт первую букву email', () => {
    expect(getInitials(null, 'zed@example.com')).toBe('Z');
    expect(getInitials('', 'zed@example.com')).toBe('Z');
    expect(getInitials('   ', 'zed@example.com')).toBe('Z');
  });
});
