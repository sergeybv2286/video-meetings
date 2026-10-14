import { describe, expect, it } from 'vitest';
import {
  ACCEPT,
  ALLOWED_EXTENSIONS,
  fileTypeLabel,
  formatFileSize,
  getExtension,
  MAX_FILE_SIZE,
  validateFile,
} from './meeting-file';

describe('getExtension', () => {
  it('берёт последнее расширение в нижнем регистре', () => {
    expect(getExtension('Запись.встречи.MP4')).toBe('mp4');
  });

  it('пусто, если расширения нет или имя — только расширение', () => {
    expect(getExtension('README')).toBe('');
    expect(getExtension('.mp4')).toBe('');
    expect(getExtension('file.')).toBe('');
  });
});

describe('validateFile', () => {
  it.each(ALLOWED_EXTENSIONS)('принимает .%s', (ext) => {
    expect(validateFile({ name: `file.${ext}`, size: 1024 })).toBeNull();
  });

  it('расширение не зависит от регистра', () => {
    expect(validateFile({ name: 'ЗАПИСЬ.MP4', size: 10 })).toBeNull();
  });

  it('отклоняет неподдерживаемый формат с перечислением допустимых', () => {
    const message = validateFile({ name: 'virus.exe', size: 10 });
    expect(message).toMatch(/^Формат не поддерживается/);
    for (const ext of ALLOWED_EXTENSIONS) expect(message).toContain(ext);
  });

  it('отклоняет файл без расширения', () => {
    expect(validateFile({ name: 'README', size: 10 })).not.toBeNull();
  });

  it('отклоняет пустой файл', () => {
    expect(validateFile({ name: 'a.txt', size: 0 })).toBe('Файл пустой');
  });

  it('принимает ровно 500 МБ и отклоняет на байт больше', () => {
    expect(validateFile({ name: 'a.mp4', size: MAX_FILE_SIZE })).toBeNull();
    expect(validateFile({ name: 'a.mp4', size: MAX_FILE_SIZE + 1 })).toBe(
      'Файл слишком большой. Максимальный размер — 500 МБ',
    );
  });

  it('формат проверяется раньше размера', () => {
    expect(validateFile({ name: 'a.exe', size: MAX_FILE_SIZE + 1 })).toMatch(
      /^Формат не поддерживается/,
    );
  });
});

describe('ACCEPT', () => {
  it('содержит все допустимые расширения через запятую с точкой', () => {
    expect(ACCEPT.split(',')).toEqual(ALLOWED_EXTENSIONS.map((e) => `.${e}`));
  });
});

describe('formatFileSize', () => {
  it.each([
    [0, '0 Б'],
    [45, '45 Б'],
    [1023, '1023 Б'],
    [1024, '1 КБ'],
    [1536, '1,5 КБ'],
    [10 * 1024, '10 КБ'],
    [1024 * 1024, '1 МБ'],
    [1.25 * 1024 * 1024, '1,3 МБ'],
    [150 * 1024 * 1024, '150 МБ'],
    [MAX_FILE_SIZE, '500 МБ'],
    [1024 ** 3, '1 ГБ'],
    [5 * 1024 ** 3, '5 ГБ'],
  ])('%d → %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it('отрицательные значения считаются нулём', () => {
    expect(formatFileSize(-5)).toBe('0 Б');
  });
});

describe('fileTypeLabel', () => {
  it('подписывает известные типы по расширению исходного имени', () => {
    expect(fileTypeLabel('Запись.MP4')).toBe('Видео MP4');
    expect(fileTypeLabel('subs.vtt')).toBe('Субтитры VTT');
    expect(fileTypeLabel('итоги.docx')).toBe('Документ Word');
  });

  it('есть подпись для каждого допустимого расширения', () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      expect(fileTypeLabel(`a.${ext}`)).not.toBe('Файл');
    }
  });

  it('неизвестное расширение — «Файл»', () => {
    expect(fileTypeLabel('a.xyz')).toBe('Файл');
  });
});
