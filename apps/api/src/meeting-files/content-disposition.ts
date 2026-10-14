/**
 * Заголовок `Content-Disposition: attachment` с исходным именем: ASCII-вариант в `filename`
 * для старых клиентов и UTF-8 в `filename*` (RFC 6266 / 5987).
 */
export function attachmentDisposition(fileName: string): string {
  const fallback =
    fileName
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\%]/g, '_')
      .trim() || 'file';
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
