'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type SubmitEvent } from 'react';
import { api, ApiError, type Meeting } from '@/lib/api';
import { clearSession, useSession } from '@/lib/session';

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function MeetingItem({ meeting }: { meeting: Meeting }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-black/10 px-4 py-3 dark:border-white/15">
      <span>{meeting.title}</span>
      <time className="text-sm opacity-60" dateTime={meeting.createdAt}>
        {dateFormat.format(new Date(meeting.createdAt))}
      </time>
    </li>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');

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

  async function onCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      const meeting = await api.createMeeting(title);
      setMeetings((current) => [meeting, ...(current ?? [])]);
      setTitle('');
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'Не удалось создать встречу',
      );
    }
  }

  if (loading || !session) return null;

  const latest = meetings?.slice(0, 3) ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <p>
          Вы вошли как <strong data-testid="user-email">{session.email}</strong>
        </p>
        <button
          onClick={() => {
            clearSession();
            router.replace('/login');
          }}
          className="rounded-md border border-black/20 px-3 py-1.5 dark:border-white/25"
        >
          Выйти
        </button>
      </header>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <form onSubmit={onCreate} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название новой встречи"
          maxLength={100}
          className="flex-1 rounded-md border border-black/20 bg-transparent px-3 py-2 dark:border-white/25"
        />
        <button
          type="submit"
          className="rounded-md bg-foreground px-4 py-2 text-background"
        >
          Создать
        </button>
      </form>

      {meetings === null && !error ? (
        <p className="opacity-60">Загрузка…</p>
      ) : (
        <>
          {latest.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Последние встречи</h2>
              <ul className="space-y-2" data-testid="latest-meetings">
                {latest.map((m) => (
                  <MeetingItem key={m.id} meeting={m} />
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Все встречи</h2>
            {meetings && meetings.length > 0 ? (
              <ul className="space-y-2" data-testid="all-meetings">
                {meetings.map((m) => (
                  <MeetingItem key={m.id} meeting={m} />
                ))}
              </ul>
            ) : (
              <p className="opacity-60">Встреч пока нет.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
