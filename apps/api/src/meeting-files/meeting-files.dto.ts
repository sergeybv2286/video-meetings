import type {
  MeetingFile,
  TranscriptionStatus,
} from '../generated/prisma/client.js';

/** Метаданные файла для клиента; `storageKey` наружу не отдаётся. */
export interface MeetingFileDto {
  id: string;
  meetingId: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: MeetingFile['status'];
  uploadedAt: string;
  /** Статус транскрибации; `null`, если файл не MP4/MP3. */
  transcriptionStatus: TranscriptionStatus | null;
}

export function toMeetingFileDto(
  file: MeetingFile,
  transcriptionStatus: TranscriptionStatus | null = null,
): MeetingFileDto {
  return {
    id: file.id,
    meetingId: file.meetingId,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    status: file.status,
    uploadedAt: file.uploadedAt.toISOString(),
    transcriptionStatus,
  };
}
