'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import { AppTitle } from '@/components/app-title';
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
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
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <AppTitle />
      <Card className="w-full max-w-sm">
        <Card.Header>
          <Card.Title>{text.title}</Card.Title>
        </Card.Header>
        <Card.Content>
          <Form onSubmit={onSubmit} className="space-y-4">
            <TextField
              name="email"
              type="email"
              isRequired
              autoComplete="email"
            >
              <Label>Email</Label>
              <Input />
              <FieldError />
            </TextField>

            <TextField
              name="password"
              type="password"
              isRequired
              minLength={6}
              autoComplete={text.autocomplete}
            >
              <Label>Пароль</Label>
              <Input />
              <FieldError />
            </TextField>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button
              type="submit"
              isPending={pending}
              fullWidth
              className="min-h-11"
            >
              {pending ? 'Подождите…' : text.submit}
            </Button>
          </Form>
        </Card.Content>
        <Card.Footer>
          <p className="text-sm">
            {text.altText}{' '}
            <Link
              href={text.altHref}
              className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4 transition-colors hover:opacity-80 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {text.altLink}
            </Link>
          </p>
        </Card.Footer>
      </Card>
    </main>
  );
}
