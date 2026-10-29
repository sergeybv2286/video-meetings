'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Spinner } from '@heroui/react';
import {
  api,
  ApiError,
  downloadTranscription,
  type MeetingFile,
  type Transcription,
  type TranscriptionStatus,
} from '@/lib/api';

/** Как часто спрашиваем API, пока задача «В очереди» или «В процессе». */
export const POLL_INTERVAL_MS = 3000;

const STATUS_LABELS: Record<TranscriptionStatus, string> = {
  QUEUED: 'В очереди',
  PROCESSING: 'В процессе',
  DONE: 'Готово',
  FAILED: 'Ошибка',
};

const STATUS_COLORS: Record<
  TranscriptionStatus,
  'default' | 'accent' | 'success' | 'danger'
> = {
  QUEUED: 'default',
  PROCESSING: 'accent',
  DONE: 'success',
  FAILED: 'danger',
};

function isActive(status: TranscriptionStatus | null | undefined) {
  return status === 'QUEUED' || status === 'PROCESSING';
}

function messageOf(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

/**
 * Транскрибация файла встречи: статус, текст, «Скачать .txt» и «Повторить». Пока задача в
 * работе, раз в несколько секунд опрашивает API и останавливается, когда задач в работе нет.
 * Для файлов, кроме MP4/MP3, ничего не показывает. Состояние привязано к файлу:
 * родитель задаёт `key`, поэтому замена файла начинает всё с чистого листа.
 */
export function TranscriptionSection({ file }: { file: MeetingFile }) {
  const [transcription, setTranscription] = useState<Transcription | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Растёт после «Повторить» и «Обновить»: эффект опроса стартует заново.
  const [syncs, setSyncs] = useState(0);
  // Задача известна как активная (после «Повторить»): первая неудача опроса его не прекращает.
  const activeRef = useRef(false);

  const supported = file.transcriptionStatus !== null;
  const meetingId = file.meetingId;
  const initialStatus = file.transcriptionStatus;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Без ответа продолжаем опрос только для задачи в работе.
    let keepPolling = isActive(initialStatus) || activeRef.current;

    async function tick() {
      try {
        const next = await api.getTranscription(meetingId);
        if (cancelled) return;
        setTranscription(next);
        setLoadError(null);
        keepPolling = isActive(next.status);
        activeRef.current = keepPolling;
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setLoadError('Транскрибация недоступна');
          return;
        }
        setLoadError(messageOf(e, 'Не удалось получить статус транскрибации'));
      }
      if (keepPolling) timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supported, meetingId, initialStatus, syncs]);

  if (!supported) return null;

  const status = transcription?.status ?? initialStatus;

  async function download() {
    setDownloading(true);
    setActionError(null);
    try {
      await downloadTranscription(meetingId, file.originalName);
    } catch (e) {
      setActionError(messageOf(e, 'Не удалось скачать текст'));
    } finally {
      setDownloading(false);
    }
  }

  async function retry() {
    setRetrying(true);
    setActionError(null);
    try {
      setTranscription(await api.retryTranscription(meetingId));
      activeRef.current = true;
      setLoadError(null);
      setSyncs((n) => n + 1);
    } catch (e) {
      setActionError(messageOf(e, 'Не удалось повторить транскрибацию'));
      // Статус мог измениться (например, 409): подтягиваем актуальный.
      setSyncs((n) => n + 1);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section aria-labelledby="transcription-title" className="space-y-3">
      <h2 id="transcription-title" className="text-lg font-semibold">
        Транскрибация
      </h2>
      <Card className="gap-3 p-4" data-testid="transcription">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted text-sm">
            Распознавание речи выполняется локально на сервере.
          </p>
          {status && (
            <Chip
              color={STATUS_COLORS[status]}
              variant="soft"
              data-testid="transcription-status"
            >
              {STATUS_LABELS[status]}
            </Chip>
          )}
        </div>

        <div aria-live="polite">
          {isActive(status) && (
            <p className="text-muted flex items-center gap-2 text-sm">
              <Spinner size="sm" />
              {status === 'QUEUED'
                ? 'Файл ждёт своей очереди…'
                : 'Распознаём речь, это может занять время…'}
            </p>
          )}
          {status === 'DONE' && transcription && (
            <p
              className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-default/50 p-3 text-sm"
              data-testid="transcription-text"
              tabIndex={0}
            >
              {transcription.text || 'В файле не найдено речи.'}
            </p>
          )}
        </div>

        {status === 'FAILED' && (
          <Alert status="danger" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                {transcription?.error ?? 'Не удалось выполнить транскрибацию'}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {loadError && (
          <Alert status="danger" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{loadError}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {actionError && (
          <Alert status="danger" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{actionError}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <div className="flex flex-wrap gap-3">
          {status === 'DONE' && (
            <Button
              variant="secondary"
              className="min-h-11"
              isPending={downloading}
              onPress={() => void download()}
            >
              {downloading ? 'Скачиваем…' : 'Скачать .txt'}
            </Button>
          )}
          {status === 'FAILED' && (
            <Button
              variant="secondary"
              className="min-h-11"
              isPending={retrying}
              onPress={() => void retry()}
            >
              {retrying ? 'Запускаем…' : 'Повторить'}
            </Button>
          )}
          {loadError && (
            <Button
              variant="tertiary"
              className="min-h-11"
              onPress={() => setSyncs((n) => n + 1)}
            >
              Обновить
            </Button>
          )}
        </div>
      </Card>
    </section>
  );
}
