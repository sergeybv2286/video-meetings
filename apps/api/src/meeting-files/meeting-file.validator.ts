import { UnsupportedMediaTypeException } from '@nestjs/common';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import { open } from 'node:fs/promises';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_TYPES,
  getExtension,
  type AllowedType,
} from './meeting-file.types.js';

/** Сколько байт начала файла достаточно для первичной проверки сигнатуры. */
export const PREFIX_BYTES = 4100;
const TEXT_SCAN_BYTES = 64 * 1024;

const mismatch = () =>
  new UnsupportedMediaTypeException(
    'Содержимое файла не соответствует его расширению',
  );

/** Тип по расширению; неизвестное расширение — 415 до записи на диск. */
export function resolveAllowedType(fileName: string): AllowedType {
  const type = ALLOWED_TYPES[getExtension(fileName)];
  if (!type) {
    throw new UnsupportedMediaTypeException(
      `Недопустимый тип файла. Разрешены: ${ALLOWED_EXTENSIONS.join(', ')}`,
    );
  }
  return type;
}

/** Бинарный файл с NUL-байтом не может быть текстом (UTF-16 с BOM — допустимое исключение). */
function assertLooksLikeText(buffer: Buffer): void {
  const utf16Bom =
    buffer.length >= 2 &&
    ((buffer[0] === 0xff && buffer[1] === 0xfe) ||
      (buffer[0] === 0xfe && buffer[1] === 0xff));
  if (!utf16Bom && buffer.includes(0)) throw mismatch();
}

/** Этап 1 (по первому чанку, до продолжения записи): сигнатура должна подходить расширению. */
export async function validatePrefix(
  prefix: Buffer,
  type: AllowedType,
): Promise<void> {
  if (type.kind === 'text') return assertLooksLikeText(prefix);
  // Начало файла может быть недостаточным для определения (например, большой ID3-тег
  // у mp3): неопределённый результат не отклоняем, решает этап 2 по всему файлу.
  const detected = await fileTypeFromBuffer(prefix).catch(() => undefined);
  if (detected && !type.detected.includes(detected.mime)) throw mismatch();
}

/** Этап 2 (на готовом tmp-файле, до `rename`): полное определение и проверка архива OOXML. */
export async function validateFile(
  filePath: string,
  type: AllowedType,
): Promise<void> {
  if (type.kind === 'text') {
    const handle = await open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(TEXT_SCAN_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, TEXT_SCAN_BYTES, 0);
      return assertLooksLikeText(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }
  const detected = await fileTypeFromFile(filePath);
  if (!detected || !type.detected.includes(detected.mime)) throw mismatch();
  if (type.kind === 'ooxml' && type.zipEntry) {
    const entries = await listZipEntries(filePath);
    if (!entries.includes(type.zipEntry)) throw mismatch();
  }
}

/** Имена записей из центрального каталога zip (без распаковки). */
export async function listZipEntries(filePath: string): Promise<string[]> {
  const handle = await open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    const tailSize = Math.min(size, 22 + 0xffff);
    const tail = Buffer.alloc(tailSize);
    await handle.read(tail, 0, tailSize, size - tailSize);
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw mismatch();
    const total = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset + cdSize > size) throw mismatch();
    const cd = Buffer.alloc(cdSize);
    await handle.read(cd, 0, cdSize, cdOffset);
    const names: string[] = [];
    let pos = 0;
    for (let i = 0; i < total; i++) {
      if (pos + 46 > cd.length || cd.readUInt32LE(pos) !== 0x02014b50) {
        throw mismatch();
      }
      const nameLen = cd.readUInt16LE(pos + 28);
      const extraLen = cd.readUInt16LE(pos + 30);
      const commentLen = cd.readUInt16LE(pos + 32);
      names.push(cd.toString('utf8', pos + 46, pos + 46 + nameLen));
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return names;
  } finally {
    await handle.close();
  }
}
