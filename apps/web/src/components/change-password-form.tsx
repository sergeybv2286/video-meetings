'use client';

import { useState, type FormEvent } from 'react';
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import { api, ApiError } from '@/lib/api';
import { saveSession } from '@/lib/session';

const MIN_PASSWORD_LENGTH = 6;
const PASSWORD_TOO_SHORT = `Новый пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`;

/** Форма смены пароля (`PUT /users/me/password`). Сервер отзывает старые токены и выдаёт новый — он заменяет сессию. */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setSaved(false);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(PASSWORD_TOO_SHORT);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      saveSession({ token: result.accessToken, email: result.user.email });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Что-то пошло не так');
      setPending(false);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setSaved(true);
    setPending(false);
  }

  return (
    <Form onSubmit={onSubmit} className="space-y-4">
      <TextField
        name="currentPassword"
        type="password"
        value={currentPassword}
        onChange={(value) => {
          setCurrentPassword(value);
          setSaved(false);
          setError(null);
        }}
        isRequired
        autoComplete="current-password"
      >
        <Label>Текущий пароль</Label>
        <Input />
        <FieldError />
      </TextField>

      <TextField
        name="newPassword"
        type="password"
        value={newPassword}
        onChange={(value) => {
          setNewPassword(value);
          setSaved(false);
          setError(null);
        }}
        isRequired
        autoComplete="new-password"
      >
        <Label>Новый пароль</Label>
        <Input />
        <FieldError />
      </TextField>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-success">
          Пароль изменён
        </p>
      )}

      <Button type="submit" isPending={pending} className="min-h-11">
        {pending ? 'Сохранение…' : 'Сменить пароль'}
      </Button>
    </Form>
  );
}
