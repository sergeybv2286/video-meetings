-- CreateEnum
CREATE TYPE "transcription_status" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "meeting_file_transcriptions" (
    "id" UUID NOT NULL,
    "meeting_file_id" UUID NOT NULL,
    "status" "transcription_status" NOT NULL DEFAULT 'QUEUED',
    "text" TEXT,
    "error" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_file_transcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_file_transcriptions_meeting_file_id_key" ON "meeting_file_transcriptions"("meeting_file_id");

-- AddForeignKey
ALTER TABLE "meeting_file_transcriptions" ADD CONSTRAINT "meeting_file_transcriptions_meeting_file_id_fkey" FOREIGN KEY ("meeting_file_id") REFERENCES "meeting_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
