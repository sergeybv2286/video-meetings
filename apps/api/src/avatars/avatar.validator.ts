import { UnsupportedMediaTypeException } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';

/** Лимит размера аватара: 5 МБ. */
export const AVATAR_MAX_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/** MIME аватара по содержимому (расширение и клиентский тип игнорируются); иначе 415. */
export async function detectAvatarMime(content: Buffer): Promise<string> {
  const detected = await fileTypeFromBuffer(content).catch(() => undefined);
  if (!detected || !ALLOWED_MIMES.includes(detected.mime)) {
    throw new UnsupportedMediaTypeException(
      'Недопустимый тип файла. Разрешены изображения JPEG, PNG или WebP',
    );
  }
  return detected.mime;
}
