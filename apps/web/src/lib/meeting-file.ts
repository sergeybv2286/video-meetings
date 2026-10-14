/** Лимит и допустимые форматы совпадают с серверными (`apps/api/src/meeting-files`). */
export const MAX_FILE_SIZE = 500 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  'mp4',
  'mov',
  'webm',
  'mp3',
  'm4a',
  'wav',
  'pdf',
  'docx',
  'pptx',
  'txt',
  'vtt',
  'srt',
] as const;

/** Значение для `<input accept>`: диалог показывает только подходящие файлы. */
export const ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/** Группы форматов для подсказки в зоне загрузки. */
export const FORMAT_GROUPS = [
  { label: 'Видео', formats: 'mp4, mov, webm' },
  { label: 'Аудио', formats: 'mp3, m4a, wav' },
  { label: 'Текст', formats: 'txt, vtt, srt' },
  { label: 'Документы', formats: 'pdf, docx, pptx' },
] as const;

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/** Русское сообщение об ошибке или `null`, если файл можно загружать. */
export function validateFile(file: {
  name: string;
  size: number;
}): string | null {
  if (
    !(ALLOWED_EXTENSIONS as readonly string[]).includes(getExtension(file.name))
  ) {
    return `Формат не поддерживается. Допустимые форматы: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }
  if (file.size === 0) return 'Файл пустой';
  if (file.size > MAX_FILE_SIZE) {
    return `Файл слишком большой. Максимальный размер — ${MAX_FILE_SIZE / 1024 / 1024} МБ`;
  }
  return null;
}

const UNITS = ['Б', 'КБ', 'МБ', 'ГБ'];

/** «1,5 МБ»: десятичная запятая, один знак после неё только если он нужен. */
export function formatFileSize(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const text =
    unit === 0 || value >= 100
      ? String(Math.round(value))
      : value.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `${text} ${UNITS[unit]}`;
}

const TYPE_LABELS: Record<string, string> = {
  mp4: 'Видео MP4',
  mov: 'Видео MOV',
  webm: 'Видео WebM',
  mp3: 'Аудио MP3',
  m4a: 'Аудио M4A',
  wav: 'Аудио WAV',
  pdf: 'Документ PDF',
  docx: 'Документ Word',
  pptx: 'Презентация PowerPoint',
  txt: 'Текст',
  vtt: 'Субтитры VTT',
  srt: 'Субтитры SRT',
};

/** Человекочитаемый тип по расширению исходного имени. */
export function fileTypeLabel(fileName: string): string {
  return TYPE_LABELS[getExtension(fileName)] ?? 'Файл';
}
