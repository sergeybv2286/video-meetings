'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Card, Skeleton } from '@heroui/react';
import { AppTitle } from '@/components/app-title';
import { Avatar } from '@/components/avatar';
import { api, ApiError, type UserProfile } from '@/lib/api';
import { useSession } from '@/lib/session';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; profile: UserProfile };

export default function ProfilePage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const token = session?.token;

  // Protected page: no session -> login.
  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .getMe()
      .then((profile) => {
        if (!cancelled) setState({ kind: 'ready', profile });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message:
            e instanceof ApiError ? e.message : 'Не удалось загрузить профиль',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading || !session) return null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-8">
      <AppTitle />
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-accent hover:underline"
      >
        ← К встречам
      </Link>
      <h2 className="text-2xl font-semibold">Профиль</h2>
      {state.kind === 'loading' && (
        <Skeleton
          className="h-32 w-full rounded-xl"
          aria-busy="true"
          aria-label="Загрузка профиля"
        />
      )}
      {state.kind === 'error' && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{state.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {state.kind === 'ready' && (
        <Card className="flex-col items-start gap-6 p-6 sm:flex-row sm:items-center">
          <Avatar
            userId={state.profile.id}
            hasAvatar={state.profile.hasAvatar}
            avatarUpdatedAt={state.profile.avatarUpdatedAt}
            name={state.profile.name}
            email={state.profile.email}
          />
          <div className="w-full min-w-0 flex-1 space-y-1">
            {state.profile.name ? (
              <p className="break-words text-xl font-semibold">
                {state.profile.name}
              </p>
            ) : (
              <p className="text-xl text-muted">Имя не указано</p>
            )}
            <p className="break-all text-muted">{state.profile.email}</p>
          </div>
          <Link
            href="/profile/edit"
            className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-medium text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Редактировать
          </Link>
        </Card>
      )}
    </main>
  );
}
