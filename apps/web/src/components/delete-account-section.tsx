'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  Button,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import { api, ApiError } from '@/lib/api';
import { clearSession } from '@/lib/session';

/** Удаление аккаунта (`DELETE /users/me`): модальное подтверждение вводом пароля, затем выход. */
export function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount(password);
    } catch (e) {
      // Диалог остаётся открытым: ошибку видно рядом с полем, можно повторить.
      setError(
        e instanceof ApiError ? e.message : 'Не удалось удалить аккаунт',
      );
      setDeleting(false);
      return;
    }
    clearSession();
    router.replace('/login');
  }

  function onOpenChange(next: boolean) {
    // Во время удаления диалог не закрывается (Escape, клик по фону).
    if (deleting) return;
    setOpen(next);
    if (!next) {
      setPassword('');
      setError(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted">
        Аккаунт будет удалён без возможности восстановления. Для подтверждения
        понадобится пароль.
      </p>
      <Button
        variant="danger-soft"
        className="min-h-11"
        onPress={() => setOpen(true)}
      >
        Удалить аккаунт
      </Button>
      <AlertDialog.Backdrop
        isOpen={open}
        onOpenChange={onOpenChange}
        isDismissable={!deleting}
        isKeyboardDismissDisabled={deleting}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Удалить аккаунт?</AlertDialog.Heading>
            </AlertDialog.Header>
            <Form onSubmit={remove}>
              <AlertDialog.Body className="space-y-3">
                <p>Введите пароль, чтобы подтвердить удаление аккаунта.</p>
                <TextField
                  name="password"
                  type="password"
                  value={password}
                  onChange={(value) => {
                    setPassword(value);
                    setError(null);
                  }}
                  isRequired
                  autoComplete="current-password"
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
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  slot="close"
                  variant="tertiary"
                  className="min-h-11"
                  isDisabled={deleting}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  className="min-h-11"
                  isPending={deleting}
                  isDisabled={password === ''}
                >
                  {deleting ? 'Удаляем…' : 'Удалить аккаунт'}
                </Button>
              </AlertDialog.Footer>
            </Form>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
