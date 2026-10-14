'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Alert, Button, ProgressBar } from '@heroui/react';
import { api, ApiError, uploadMeetingFile, type MeetingFile } from '@/lib/api';
import {
  ACCEPT,
  FORMAT_GROUPS,
  formatFileSize,
  MAX_FILE_SIZE,
  validateFile,
} from '@/lib/meeting-file';

interface Props {
  meetingId: string;
  onUploaded: (file: MeetingFile) => void;
  /** `PUT` — замена существующего файла; при ошибке старый файл остаётся на сервере. */
  method?: 'POST' | 'PUT';
  heading?: string;
  /** Если задан, рядом с выбором файла показывается «Отмена» (например, чтобы закрыть замену). */
  onCancel?: () => void;
}

/** Зона загрузки файла встречи: выбор через диалог и drag-and-drop, прогресс, ошибка и повтор. */
export function FileUpload({
  meetingId,
  onUploaded,
  method = 'POST',
  heading = 'Файл встречи',
  onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Уход со страницы прерывает идущую загрузку.
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function start(selected: File) {
    const invalid = validateFile(selected);
    setFile(selected);
    if (invalid) {
      // Загрузка не начинается: на сервер ничего не уходит.
      setError(invalid);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setProgress(0);
    setUploading(true);
    try {
      const uploaded = await uploadMeetingFile(
        meetingId,
        selected,
        setProgress,
        controller.signal,
        method,
      );
      onUploaded(uploaded);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setFile(null);
      } else {
        // Сеть оборвалась (0) или файл уже есть (409): возможно, сервер всё же сохранил файл —
        // тогда показываем его карточку вместо бессмысленного «повторить».
        const existing =
          e instanceof ApiError && (e.status === 0 || e.status === 409)
            ? await api.getMeetingFile(meetingId).catch(() => null)
            : null;
        if (existing) {
          onUploaded(existing);
        } else {
          setError(
            e instanceof ApiError ? e.message : 'Не удалось загрузить файл',
          );
        }
      }
    } finally {
      setUploading(false);
      controllerRef.current = null;
    }
  }

  function pick(files: FileList | null) {
    if (!files || files.length === 0 || uploading) return;
    if (files.length > 1) {
      setFile(null);
      setError('Можно загрузить только один файл');
      return;
    }
    void start(files[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files);
  }

  return (
    <section aria-labelledby="file-upload-title" className="space-y-3">
      <h2 id="file-upload-title" className="text-lg font-semibold">
        {heading}
      </h2>

      {error && (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {file && <strong className="break-all">{file.name}: </strong>}
              {error}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div
        data-testid="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={(e) => {
          // Переход курсора на вложенный элемент зоны не должен гасить подсветку.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-4 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging
            ? 'border-accent bg-accent/10'
            : 'border-separator bg-surface'
        }`}
      >
        {uploading && file ? (
          <div className="w-full max-w-md space-y-3 text-left">
            <ProgressBar
              aria-label={`Загрузка файла ${file.name}`}
              value={progress}
              className="w-full"
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-all">{file.name}</span>
                <ProgressBar.Output />
              </div>
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            <Button
              variant="secondary"
              className="min-h-11"
              onPress={() => controllerRef.current?.abort()}
            >
              Отменить
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="font-medium">
                Перетащите файл сюда или выберите на устройстве
              </p>
              <p className="text-sm text-muted">
                Не больше {MAX_FILE_SIZE / 1024 / 1024} МБ, один файл на встречу
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                className="min-h-11"
                onPress={() => inputRef.current?.click()}
              >
                Выбрать файл
              </Button>
              {onCancel && (
                <Button
                  variant="tertiary"
                  className="min-h-11"
                  onPress={onCancel}
                >
                  Отмена
                </Button>
              )}
              {error && file && validateFile(file) === null && (
                <Button
                  variant="secondary"
                  className="min-h-11"
                  onPress={() => void start(file)}
                >
                  Повторить загрузку{' '}
                  <span className="text-muted">
                    ({formatFileSize(file.size)})
                  </span>
                </Button>
              )}
            </div>
            <dl className="grid w-full max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left text-sm">
              {FORMAT_GROUPS.map((group) => (
                <div key={group.label} className="contents">
                  <dt className="text-muted">{group.label}</dt>
                  <dd>{group.formats}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-label="Файл встречи"
          data-testid="file-input"
          onChange={(e) => {
            pick(e.target.files);
            // Тот же файл можно выбрать повторно после ошибки.
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}
