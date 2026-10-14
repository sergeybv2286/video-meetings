'use client';

import { useState } from 'react';
import { Alert, Button } from '@heroui/react';
import { ApiError, downloadMeetingFile, type MeetingFile } from '@/lib/api';
import { FileCard } from './file-card';
import { FileUpload } from './file-upload';

interface Props {
  file: MeetingFile;
  /** Файл заменён: приходят новые метаданные. */
  onReplaced: (file: MeetingFile) => void;
}

/** Файл встречи: карточка и действия над ним (скачать, заменить). */
export function FileSection({ file, onReplaced }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadMeetingFile(file.meetingId, file.originalName);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось скачать файл');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section aria-labelledby="file-section-title" className="space-y-3">
      <h2 id="file-section-title" className="text-lg font-semibold">
        Файл встречи
      </h2>
      {error && (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <FileCard
        file={file}
        actions={
          <>
            <Button
              variant="secondary"
              className="min-h-11"
              isPending={downloading}
              onPress={() => void download()}
            >
              {downloading ? 'Скачиваем…' : 'Скачать'}
            </Button>
            <Button
              variant="secondary"
              className="min-h-11"
              isDisabled={replacing}
              onPress={() => setReplacing(true)}
            >
              Заменить файл
            </Button>
          </>
        }
      />
      {replacing && (
        <FileUpload
          meetingId={file.meetingId}
          method="PUT"
          heading="Заменить файл"
          onCancel={() => setReplacing(false)}
          onUploaded={(next) => {
            setReplacing(false);
            onReplaced(next);
          }}
        />
      )}
    </section>
  );
}
