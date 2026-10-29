'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Skeleton } from '@heroui/react';
import { AppTitle } from '@/components/app-title';
import { FileSection } from '@/components/file-section';
import { FileUpload } from '@/components/file-upload';
import { TranscriptionSection } from '@/components/transcription-section';
import { api, ApiError, type Meeting, type MeetingFile } from '@/lib/api';
import { useSession } from '@/lib/session';

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'long',
  timeStyle: 'short',
});

type State =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; meeting: Meeting; file: MeetingFile | null };

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  // key: при смене встречи состояние (и зона загрузки) создаются заново, чужие данные не остаются.
  return <MeetingView key={id} id={id} />;
}

function MeetingView({ id }: { id: string }) {
  const router = useRouter();
  const { session, loading } = useSession();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const token = session?.token;

  // Функциональное обновление: не затираем свежее состояние устаревшим замыканием.
  function setFile(file: MeetingFile | null) {
    setState((prev) => (prev.kind === 'ready' ? { ...prev, file } : prev));
  }

  // Protected page: no session -> login.
  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([api.getMeeting(id), api.getMeetingFile(id)])
      .then(([meeting, file]) => {
        if (!cancelled) setState({ kind: 'ready', meeting, file });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setState({ kind: 'not-found' });
        } else {
          setState({
            kind: 'error',
            message:
              e instanceof ApiError
                ? e.message
                : 'Не удалось загрузить встречу',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  if (loading || !session) return null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-8">
      <AppTitle />
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-accent hover:underline"
      >
        ← К списку встреч
      </Link>

      {state.kind === 'loading' && (
        <div
          aria-busy="true"
          aria-label="Загрузка встречи"
          className="space-y-3"
        >
          <Skeleton className="h-8 w-2/3 rounded-lg" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      )}

      {state.kind === 'not-found' && (
        <div className="space-y-2" role="alert">
          <h1 className="text-2xl font-semibold">Встреча не найдена</h1>
          <p className="text-muted">
            Возможно, она удалена или принадлежит другому пользователю.
          </p>
        </div>
      )}

      {state.kind === 'error' && (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{state.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {state.kind === 'ready' && (
        <>
          <header className="space-y-1">
            <h1 className="break-words text-2xl font-semibold">
              {state.meeting.title}
            </h1>
            <time className="text-muted" dateTime={state.meeting.date}>
              {dateFormat.format(new Date(state.meeting.date))}
            </time>
          </header>
          {state.file ? (
            <>
              <FileSection
                file={state.file}
                onReplaced={(file) => setFile(file)}
                onDeleted={() => setFile(null)}
              />
              {/* key: после замены файла состояние и опрос начинаются заново. */}
              <TranscriptionSection
                key={`${state.file.id}:${state.file.uploadedAt}`}
                file={state.file}
              />
            </>
          ) : (
            <FileUpload
              meetingId={state.meeting.id}
              onUploaded={(file) => setFile(file)}
            />
          )}
        </>
      )}
    </main>
  );
}
