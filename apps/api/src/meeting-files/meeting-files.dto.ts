import type { MeetingFile } from '../generated/prisma/client.js';

/** Метаданные файла для клиента; `storageKey` наружу не отдаётся. */
export interface MeetingFileDto {
  id: string;
  meetingId: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: MeetingFile['status'];
  uploadedAt: string;
}

export function toMeetingFileDto(file: MeetingFile): MeetingFileDto {
  return {
    id: file.id,
    meetingId: file.meetingId,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    status: file.status,
    uploadedAt: file.uploadedAt.toISOString(),
  };
}
