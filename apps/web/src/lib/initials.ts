/** Инициалы для заглушки аватара: по имени (до двух слов), а без имени — первая буква email. */
export function getInitials(name: string | null, email: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const source = words.length > 0 ? words.slice(0, 2) : [email.trim()];
  return source
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase('ru-RU');
}
