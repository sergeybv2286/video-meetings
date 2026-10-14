import { extname } from 'node:path';

/** Лимит размера файла встречи: 500 МБ (`MEETING_FILE_MAX_SIZE` в байтах переопределяет — для тестов). */
export const DEFAULT_MAX_FILE_SIZE = 500 * 1024 * 1024;

/** Верхняя граница лимита: колонка `size` в БД — Int (2^31 − 1). */
export const MAX_FILE_SIZE_CAP = 2_147_483_647;

export function getMaxFileSize(): number {
  const value = Number(process.env.MEETING_FILE_MAX_SIZE);
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, MAX_FILE_SIZE_CAP)
    : DEFAULT_MAX_FILE_SIZE;
}

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export type FileKind = 'binary' | 'ooxml' | 'text';

export interface AllowedType {
  kind: FileKind;
  /** MIME, который сохраняется в БД (определён сервером, а не клиентом). */
  mime: string;
  /** Типы, которые `file-type` может вернуть для такого содержимого. */
  detected: string[];
  /** Для OOXML — обязательная запись внутри архива. */
  zipEntry?: string;
}

/** Расширение → допустимое содержимое. Строгая таблица: `.mp4` с содержимым m4a отклоняется. */
export const ALLOWED_TYPES: Record<string, AllowedType> = {
  mp4: { kind: 'binary', mime: 'video/mp4', detected: ['video/mp4'] },
  mov: {
    kind: 'binary',
    mime: 'video/quicktime',
    detected: ['video/quicktime'],
  },
  webm: { kind: 'binary', mime: 'video/webm', detected: ['video/webm'] },
  mp3: { kind: 'binary', mime: 'audio/mpeg', detected: ['audio/mpeg'] },
  m4a: {
    kind: 'binary',
    mime: 'audio/x-m4a',
    detected: ['audio/x-m4a', 'audio/mp4'],
  },
  wav: {
    kind: 'binary',
    mime: 'audio/wav',
    detected: ['audio/wav', 'audio/x-wav', 'audio/vnd.wave'],
  },
  pdf: {
    kind: 'binary',
    mime: 'application/pdf',
    detected: ['application/pdf'],
  },
  docx: {
    kind: 'ooxml',
    mime: DOCX_MIME,
    detected: [DOCX_MIME, 'application/zip'],
    zipEntry: 'word/document.xml',
  },
  pptx: {
    kind: 'ooxml',
    mime: PPTX_MIME,
    detected: [PPTX_MIME, 'application/zip'],
    zipEntry: 'ppt/presentation.xml',
  },
  txt: { kind: 'text', mime: 'text/plain', detected: [] },
  vtt: { kind: 'text', mime: 'text/vtt', detected: [] },
  srt: { kind: 'text', mime: 'application/x-subrip', detected: [] },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_TYPES);

export function getExtension(fileName: string): string {
  return extname(fileName).slice(1).toLowerCase();
}

/** Имя для хранения в БД: без путей и управляющих символов, не длиннее 255 символов. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'file';
  if (cleaned.length <= 255) return cleaned;
  const ext = extname(cleaned);
  return cleaned.slice(0, 255 - ext.length) + ext;
}
