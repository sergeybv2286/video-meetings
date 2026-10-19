'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Card, Skeleton } from '@heroui/react';
import { AppTitle } from '@/components/app-title';
import { ProfileForm } from '@/components/profile-form';
import { api, ApiError, type UserProfile } from '@/lib/api';
import { saveSession, useSession } from '@/lib/session';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; profile: UserProfile };

export default function EditProfilePage() {
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
        href="/profile"
        className="inline-flex min-h-11 items-center text-accent hover:underline"
      >
        ← К профилю
      </Link>
      <h2 className="text-2xl font-semibold">Редактирование профиля</h2>
      {state.kind === 'loading' && (
        <Skeleton
          className="h-64 w-full rounded-xl"
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
        <Card className="p-6">
          <Card.Header>
            <Card.Title>Имя и email</Card.Title>
          </Card.Header>
          <Card.Content>
            <ProfileForm
              profile={state.profile}
              onSaved={(profile) => {
                setState({ kind: 'ready', profile });
                // Email в сессии берётся из токена и устаревает после смены.
                if (token) saveSession({ token, email: profile.email });
              }}
            />
          </Card.Content>
        </Card>
      )}
    </main>
  );
}
