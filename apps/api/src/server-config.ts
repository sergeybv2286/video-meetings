import type { Server } from 'node:http';

/** Загрузка до 500 МБ на медленном канале: по умолчанию Node обрывает запрос через 5 минут. */
export const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

const HEADERS_TIMEOUT_MS = 15_000;

/** Настройки HTTP-сервера; вызывается только из `main.ts` (e2e работают без listen). */
export function configureServer(server: Server): void {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  // Заголовки должны прийти быстро: иначе медленные соединения (slowloris) держат сокеты.
  server.headersTimeout = HEADERS_TIMEOUT_MS;
}
