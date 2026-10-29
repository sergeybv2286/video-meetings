/** MIME файлов, которые транскрибируются: сервер определяет их по содержимому (MP4 и MP3). */
const TRANSCRIBABLE_MIME_TYPES = new Set(['video/mp4', 'audio/mpeg']);

export function isTranscribable(mimeType: string): boolean {
  return TRANSCRIBABLE_MIME_TYPES.has(mimeType);
}

/** Команда запуска Whisper (`WHISPER_COMMAND`, по умолчанию `whisper` из openai-whisper). */
export function getWhisperCommand(): string {
  return process.env.WHISPER_COMMAND || 'whisper';
}

/** Команда запуска ffmpeg (`FFMPEG_COMMAND`, по умолчанию `ffmpeg`). */
export function getFfmpegCommand(): string {
  return process.env.FFMPEG_COMMAND || 'ffmpeg';
}

/** Модель Whisper (`WHISPER_MODEL`, по умолчанию `base`). */
export function getWhisperModel(): string {
  return process.env.WHISPER_MODEL || 'base';
}

/** Каталог с уже скачанными моделями (`WHISPER_MODEL_DIR`); без него Whisper использует свой кэш. */
export function getWhisperModelDir(): string | undefined {
  return process.env.WHISPER_MODEL_DIR || undefined;
}

/** Максимальный срок обработки одного файла, мс (`TRANSCRIPTION_TIMEOUT_MS`, по умолчанию 2 часа). */
export const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export function getTranscriptionTimeoutMs(): number {
  const value = Number(process.env.TRANSCRIPTION_TIMEOUT_MS);
  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_TRANSCRIPTION_TIMEOUT_MS;
}

/** Дополнительный лимит повторов в минуту (`TRANSCRIPTION_RETRY_RATE_LIMIT`, по умолчанию 5). */
export const RETRY_THROTTLE = {
  default: {
    ttl: 60_000,
    limit: Number(process.env.TRANSCRIPTION_RETRY_RATE_LIMIT) || 5,
  },
};
