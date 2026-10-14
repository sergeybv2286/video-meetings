'use client';

import { useState } from 'react';
import { AlertDialog, Alert, Button } from '@heroui/react';
import {
  api,
  ApiError,
  downloadMeetingFile,
  type MeetingFile,
} from '@/lib/api';
import { FileCard } from './file-card';
import { FileUpload } from './file-upload';

interface Props {
  file: MeetingFile;
  /** Файл заменён: приходят новые метаданные. */
  onReplaced: (file: MeetingFile) => void;
  /** Файл удалён: снова доступна зона загрузки. */
  onDeleted: () => void;
}

/** Файл встречи: карточка и действия над ним (скачать, заменить, удалить с подтверждением). */
export function FileSection({ file, onReplaced, onDeleted }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteMeetingFile(file.meetingId);
      setConfirmOpen(false);
      onDeleted();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Файл уже удалён (например, в другой вкладке): цель достигнута.
        setConfirmOpen(false);
        onDeleted();
        return;
      }
      // Диалог остаётся открытым: ошибку видно рядом с кнопкой, можно повторить.
      setDeleteError(
        e instanceof ApiError ? e.message : 'Не удалось удалить файл',
      );
    } finally {
      setDeleting(false);
    }
  }

  function onConfirmOpenChange(open: boolean) {
    // Во время удаления диалог не закрывается (Escape, клик по фону).
    if (deleting) return;
    setConfirmOpen(open);
    if (!open) setDeleteError(null);
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
              onPress={() => {
                setError(null);
                setReplacing(true);
              }}
            >
              Заменить файл
            </Button>
            <Button
              variant="danger-soft"
              className="min-h-11"
              // Пока открыта замена, удаление недоступно: оно оборвало бы идущую загрузку.
              isDisabled={replacing}
              onPress={() => {
                setError(null);
                setConfirmOpen(true);
              }}
            >
              Удалить
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
      <AlertDialog.Backdrop
        isOpen={confirmOpen}
        onOpenChange={onConfirmOpenChange}
        isDismissable={!deleting}
        isKeyboardDismissDisabled={deleting}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Удалить файл?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-3">
              <p>
                Файл <strong className="break-all">{file.originalName}</strong>{' '}
                будет удалён с сервера без возможности восстановления.
              </p>
              {deleteError && (
                <Alert status="danger" role="alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{deleteError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                slot="close"
                variant="tertiary"
                className="min-h-11"
                isDisabled={deleting}
              >
                Отмена
              </Button>
              <Button
                variant="danger"
                className="min-h-11"
                isPending={deleting}
                onPress={() => void remove()}
              >
                {deleting ? 'Удаляем…' : 'Удалить'}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </section>
  );
}
