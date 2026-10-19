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
import { api, ApiError, type UserProfile } from '@/lib/api';

interface Props {
  profile: UserProfile;
  onSaved: (profile: UserProfile) => void;
}

const EMAIL_TAKEN = 'Этот email уже занят';

/** Форма имени и email (`PATCH /users/me`). Пустое имя сбрасывает имя. */
export function ProfileForm({ profile, onSaved }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setError(null);
    setSaved(false);
    setPending(true);
    try {
      const result = await api.updateMe({
        name: String(form.get('name')),
        email: String(form.get('email')),
      });
      setSaved(true);
      onSaved(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError(EMAIL_TAKEN);
      else setError(e instanceof ApiError ? e.message : 'Что-то пошло не так');
    } finally {
      setPending(false);
    }
  }

  return (
    <Form onSubmit={onSubmit} className="space-y-4">
      <TextField
        name="name"
        onChange={() => setSaved(false)}
        defaultValue={profile.name ?? ''}
        maxLength={100}
        autoComplete="name"
      >
        <Label>Имя</Label>
        <Input />
        <FieldError />
      </TextField>

      <TextField
        name="email"
        onChange={() => setSaved(false)}
        type="email"
        defaultValue={profile.email}
        isRequired
        autoComplete="email"
      >
        <Label>Email</Label>
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
          Изменения сохранены
        </p>
      )}

      <Button type="submit" isPending={pending} className="min-h-11">
        {pending ? 'Сохранение…' : 'Сохранить'}
      </Button>
    </Form>
  );
}
