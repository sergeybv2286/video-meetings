'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Card,
  Chip,
  FieldError,
  Form,
  Input,
  Label,
  Skeleton,
  TextField,
} from '@heroui/react';
import { AppTitle } from '@/components/app-title';
import { api, ApiError, type Meeting } from '@/lib/api';
import { clearSession, useSession } from '@/lib/session';

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function MeetingItem({ meeting }: { meeting: Meeting }) {
  return (
    <li>
      <Link
        href={`/meetings/${meeting.id}`}
        className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Card className="min-h-11 flex-row items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-secondary">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words font-medium">
              {meeting.title}
            </span>
            {meeting.hasFile && (
              <Chip
                size="sm"
                color="success"
                variant="soft"
                data-testid="has-file"
              >
                Есть файл
              </Chip>
            )}
          </span>
          <time
            className="shrink-0 text-sm text-muted"
            dateTime={meeting.createdAt}
          >
            {dateFormat.format(new Date(meeting.createdAt))}
          </time>
        </Card>
      </Link>
    </li>
  );
}

function MeetingsSkeleton() {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Загрузка встреч">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Skeleton className="h-16 w-full rounded-xl" />
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const token = session?.token;

  // Protected page: no session -> login.
  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .listMeetings()
      .then((data) => !cancelled && setMeetings(data))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(
            e instanceof ApiError ? e.message : 'Не удалось загрузить встречи',
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const meeting = await api.createMeeting(title.trim());
      setMeetings((current) => [meeting, ...(current ?? [])]);
      setTitle('');
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'Не удалось создать встречу',
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading || !session) return null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-8">
      <AppTitle />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <p>
          Вы вошли как <strong data-testid="user-email">{session.email}</strong>
        </p>
        <Button
          variant="secondary"
          className="min-h-11"
          onPress={() => {
            clearSession();
            router.replace('/login');
          }}
        >
          Выйти
        </Button>
      </header>

      {error && (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <Form onSubmit={onCreate} className="flex items-start gap-3">
        <TextField
          name="title"
          isRequired
          value={title}
          onChange={setTitle}
          validate={(v) => (v.trim() ? null : 'Введите название встречи')}
          className="min-w-0 flex-1"
        >
          <Label>Название новой встречи</Label>
          <Input
            ref={titleRef}
            placeholder="Например, планёрка команды"
            maxLength={100}
            className="min-h-11"
          />
          <FieldError />
        </TextField>
        <Button type="submit" isPending={creating} className="mt-6 min-h-11">
          {creating ? 'Создаём…' : 'Создать'}
        </Button>
      </Form>

      <section className="space-y-3" aria-labelledby="meetings-title">
        <h2 id="meetings-title" className="text-lg font-semibold">
          Ваши встречи
        </h2>
        {meetings === null && !error ? (
          <MeetingsSkeleton />
        ) : meetings && meetings.length > 0 ? (
          <ul className="space-y-2" data-testid="all-meetings">
            {meetings.map((m) => (
              <MeetingItem key={m.id} meeting={m} />
            ))}
          </ul>
        ) : (
          meetings && (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-separator p-6">
              <p className="text-muted">
                Встреч пока нет. Создайте первую — введите название выше.
              </p>
              <Button
                variant="secondary"
                className="min-h-11"
                onPress={() => titleRef.current?.focus()}
              >
                Создать встречу
              </Button>
            </div>
          )
        )}
      </section>
    </main>
  );
}
