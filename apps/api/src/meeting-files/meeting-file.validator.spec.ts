import { UnsupportedMediaTypeException } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mp4M4vBrand, samples } from '../../test/sample-files.js';
import { getExtension, sanitizeFileName } from './meeting-file.types.js';
import {
  listZipEntries,
  resolveAllowedType,
  validateFile,
  validatePrefix,
} from './meeting-file.validator.js';

describe('meeting-file.validator', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'mf-validator-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const check = async (ext: string, content: Buffer) => {
    const file = path.join(dir, 'f');
    await writeFile(file, content);
    const type = resolveAllowedType(`name.${ext}`);
    await validatePrefix(content.subarray(0, 4100), type);
    await validateFile(file, type);
  };

  it.each(Object.keys(samples).filter((k) => k !== 'exe'))(
    'принимает корректный .%s',
    async (ext) => {
      await expect(
        check(ext, samples[ext as keyof typeof samples]()),
      ).resolves.toBeUndefined();
    },
  );

  it('принимает .mp4 с брендом M4V (video/x-m4v)', async () => {
    await expect(check('mp4', mp4M4vBrand())).resolves.toBeUndefined();
  });

  it('отклоняет неизвестное расширение (415)', () => {
    expect(() => resolveAllowedType('virus.exe')).toThrow(
      UnsupportedMediaTypeException,
    );
    expect(() => resolveAllowedType('без-расширения')).toThrow(
      /Недопустимый тип файла/,
    );
  });

  it('отклоняет переименованное расширение', async () => {
    await expect(check('mp4', samples.exe())).rejects.toThrow(
      'Содержимое файла не соответствует его расширению',
    );
    await expect(check('pdf', samples.mp4())).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    await expect(check('mp4', samples.m4a())).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('отклоняет бинарное содержимое под видом текста', async () => {
    await expect(check('txt', samples.mp4())).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('отклоняет zip, не являющийся docx/pptx', async () => {
    await expect(check('docx', samples.pptx())).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    await expect(check('pptx', samples.docx())).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('listZipEntries возвращает имена записей', async () => {
    const file = path.join(dir, 'z.docx');
    await writeFile(file, samples.docx());
    expect(await listZipEntries(file)).toEqual([
      '[Content_Types].xml',
      'word/document.xml',
    ]);
  });

  it('listZipEntries отклоняет заголовок с огромным центральным каталогом', async () => {
    const cdSize = 2 * 1024 * 1024;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(0, 16);
    const file = path.join(dir, 'bomb.docx');
    await writeFile(file, Buffer.concat([Buffer.alloc(cdSize), eocd]));

    await expect(listZipEntries(file)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });

  it('sanitizeFileName убирает пути и управляющие символы', () => {
    expect(sanitizeFileName('../../etc/passwd.mp4')).toBe('passwd.mp4');
    expect(sanitizeFileName('C:\\a\\b.mp4')).toBe('b.mp4');
    expect(sanitizeFileName('a\u0000b\n.mp4')).toBe('ab.mp4');
    expect(sanitizeFileName('..')).toBe('file');
    const long = sanitizeFileName('я'.repeat(400) + '.mp4');
    expect(long).toHaveLength(255);
    expect(long.endsWith('.mp4')).toBe(true);
    expect(getExtension('Запись.MP4')).toBe('mp4');
  });

  it('принимает mp3 с большим ID3-тегом (начало файла не определяется)', async () => {
    const tag = Buffer.alloc(10 + 8000);
    tag.write('ID3', 0, 'latin1');
    tag[3] = 3;
    // размер тега synchsafe: 8000 = 62 * 128 + 64
    tag[8] = 62;
    tag[9] = 64;
    const mp3 = Buffer.concat([tag, samples.mp3()]);
    await expect(check('mp3', mp3)).resolves.toBeUndefined();
  });

  it('принимает текст в UTF-16 с BOM', async () => {
    const text = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('Привет', 'utf16le'),
    ]);
    await expect(check('txt', text)).resolves.toBeUndefined();
  });
});
