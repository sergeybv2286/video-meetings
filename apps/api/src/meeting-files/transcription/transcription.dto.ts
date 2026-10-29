import type {
  MeetingFileTranscription,
  TranscriptionStatus,
} from '../../generated/prisma/client.js';

/** Статус и результат транскрибации для клиента. */
export interface TranscriptionDto {
  status: TranscriptionStatus;
  /** Текст — только при статусе «Готово». */
  text: string | null;
  /** Сообщение об ошибке — только при статусе «Ошибка». */
  error: string | null;
  completedAt: string | null;
}

export function toTranscriptionDto(
  transcription: MeetingFileTranscription,
): TranscriptionDto {
  return {
    status: transcription.status,
    text: transcription.text,
    error: transcription.error,
    completedAt: transcription.completedAt?.toISOString() ?? null,
  };
}
