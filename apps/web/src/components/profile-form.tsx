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
  // Контролируемые поля: после сохранения показываем то, что вернул сервер (trim, нижний регистр).
  const [name, setName] = useState(profile.name ?? '');
  const [email, setEmail] = useState(profile.email);
  const [password, setPassword] = useState('');
  // Email, как он сохранён на сервере: смена email подтверждается паролем.
  const [savedEmail, setSavedEmail] = useState(profile.email);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const emailChanged =
    email.trim().toLowerCase() !== savedEmail.trim().toLowerCase();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setError(null);
    setSaved(false);
    setPending(true);
    let result: UserProfile;
    try {
      result = await api.updateMe({
        name,
        email,
        ...(emailChanged && { password }),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError(EMAIL_TAKEN);
      else setError(e instanceof ApiError ? e.message : 'Что-то пошло не так');
      setPending(false);
      return;
    }
    setName(result.name ?? '');
    setEmail(result.email);
    setSavedEmail(result.email);
    setPassword('');
    setSaved(true);
    setPending(false);
    // Вне try: сбой в onSaved не должен выглядеть как неудачное сохранение.
    try {
      onSaved(result);
    } catch {
      // Данные уже сохранены на сервере.
    }
  }

  return (
    <Form onSubmit={onSubmit} className="space-y-4">
      <TextField
        name="name"
        value={name}
        onChange={(value) => {
          setName(value);
          setSaved(false);
        }}
        maxLength={100}
        isDisabled={pending}
        autoComplete="name"
      >
        <Label>Имя</Label>
        <Input />
        <FieldError />
      </TextField>

      <TextField
        name="email"
        type="email"
        value={email}
        onChange={(value) => {
          setEmail(value);
          setSaved(false);
        }}
        isRequired
        isDisabled={pending}
        autoComplete="email"
      >
        <Label>Email</Label>
        <Input />
        <FieldError />
      </TextField>

      {emailChanged && (
        <TextField
          name="password"
          type="password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            setSaved(false);
          }}
          isRequired
          isDisabled={pending}
          autoComplete="current-password"
        >
          <Label>Текущий пароль (для смены email)</Label>
          <Input />
          <FieldError />
        </TextField>
      )}

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
