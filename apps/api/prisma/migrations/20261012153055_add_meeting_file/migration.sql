-- CreateEnum
CREATE TYPE "meeting_file_status" AS ENUM ('UPLOADED');

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "meeting_files" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "meeting_file_status" NOT NULL DEFAULT 'UPLOADED',
    "storage_key" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_files_meeting_id_key" ON "meeting_files"("meeting_id");
