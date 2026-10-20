/** Лимит и форматы совпадают с серверными (`apps/api/src/avatars`). */
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Значение для `<input accept>`. */
export const AVATAR_ACCEPT = ALLOWED_TYPES.join(',');

/** Русское сообщение об ошибке или `null`, если файл можно загружать. Окончательно тип проверяет сервер. */
export function validateAvatar(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Формат не поддерживается. Допустимые форматы: JPEG, PNG, WebP';
  }
  if (file.size === 0) return 'Файл пустой';
  if (file.size > MAX_AVATAR_SIZE) {
    return `Файл слишком большой. Максимальный размер — ${MAX_AVATAR_SIZE / 1024 / 1024} МБ`;
  }
  return null;
}
