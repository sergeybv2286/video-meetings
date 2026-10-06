'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type SubmitEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { saveSession, useSession } from '@/lib/session';

interface Props {
  mode: 'login' | 'register';
}

const TEXT = {
  login: {
    title: 'Вход',
    submit: 'Войти',
    altText: 'Нет аккаунта?',
    altLink: 'Зарегистрироваться',
    altHref: '/register',
    action: api.login,
    autocomplete: 'current-password',
  },
  register: {
    title: 'Регистрация',
    submit: 'Создать аккаунт',
    altText: 'Уже есть аккаунт?',
    altLink: 'Войти',
    altHref: '/login',
    action: api.register,
    autocomplete: 'new-password',
  },
} as const;

export function AuthForm({ mode }: Props) {
  const text = TEXT[mode];
  const router = useRouter();
  const { session, loading } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Already signed in — nothing to do here.
  useEffect(() => {
    if (session) router.replace('/');
  }, [session, router]);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));

    setError(null);
    setPending(true);
    try {
      const result = await text.action(email, password);
      saveSession({ token: result.accessToken, email: result.user.email });
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Что-то пошло не так');
      setPending(false);
    }
  }

  if (loading || session) return null;

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-6 shadow-sm dark:border-white/15"
      >
        <h1 className="text-2xl font-semibold">{text.title}</h1>

        <label className="block space-y-1">
          <span className="text-sm">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-black/20 bg-transparent px-3 py-2 dark:border-white/25"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">Пароль</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={text.autocomplete}
            className="w-full rounded-md border border-black/20 bg-transparent px-3 py-2 dark:border-white/25"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-60"
        >
          {pending ? 'Подождите…' : text.submit}
        </button>

        <p className="text-sm">
          {text.altText}{' '}
          <Link href={text.altHref} className="underline">
            {text.altLink}
          </Link>
        </p>
      </form>
    </main>
  );
}
