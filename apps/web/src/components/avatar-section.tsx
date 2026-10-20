'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertDialog, Alert, Button, ProgressBar } from '@heroui/react';
import { Avatar } from '@/components/avatar';
import { api, ApiError, uploadAvatar, type UserProfile } from '@/lib/api';
import {
  AVATAR_ACCEPT,
  MAX_AVATAR_SIZE,
  validateAvatar,
} from '@/lib/avatar-file';

interface Props {
  profile: UserProfile;
  /** Вызывается после успешной загрузки, замены или удаления с обновлённым профилем. */
  onChanged: (profile: UserProfile) => void;
}

/** Блок аватара на `/profile/edit`: выбор файла, проверка, прогресс, ошибка с повтором, замена, удаление. */
export function AvatarSection({ profile, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Уход со страницы прерывает идущую загрузку.
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function start(selected: File) {
    const invalid = validateAvatar(selected);
    setFile(selected);
    if (invalid) {
      // Загрузка не начинается: на сервер ничего не уходит.
      setError(invalid);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setProgress(0);
    setUploading(true);
    try {
      const result = await uploadAvatar(
        selected,
        setProgress,
        controller.signal,
      );
      setFile(null);
      onChanged({
        ...profile,
        hasAvatar: true,
        avatarUpdatedAt: result.updatedAt,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setFile(null);
      } else {
        setError(
          e instanceof ApiError ? e.message : 'Не удалось загрузить фото',
        );
      }
    } finally {
      setUploading(false);
      controllerRef.current = null;
    }
  }

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAvatar();
    } catch (e) {
      // 404 — аватара уже нет, цель достигнута.
      if (!(e instanceof ApiError && e.status === 404)) {
        setDeleteError(
          e instanceof ApiError ? e.message : 'Не удалось удалить фото',
        );
        setDeleting(false);
        return;
      }
    }
    setDeleting(false);
    setConfirmOpen(false);
    onChanged({ ...profile, hasAvatar: false, avatarUpdatedAt: null });
  }

  function onConfirmOpenChange(next: boolean) {
    // Во время удаления диалог не закрывается (Escape, клик по фону).
    if (deleting) return;
    setConfirmOpen(next);
    if (!next) setDeleteError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar
          userId={profile.id}
          name={profile.name}
          email={profile.email}
          hasAvatar={profile.hasAvatar}
          avatarUpdatedAt={profile.avatarUpdatedAt}
          size="lg"
        />
        <p className="text-sm text-muted">
          JPEG, PNG или WebP, до {MAX_AVATAR_SIZE / 1024 / 1024} МБ
        </p>
      </div>

      {error && (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {file && <strong className="break-all">{file.name}: </strong>}
              {error}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {uploading && file ? (
        <div className="max-w-md space-y-3">
          <ProgressBar
            aria-label={`Загрузка фото ${file.name}`}
            value={progress}
            className="w-full"
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-all">{file.name}</span>
              <ProgressBar.Output />
            </div>
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          <Button
            variant="secondary"
            className="min-h-11"
            onPress={() => controllerRef.current?.abort()}
          >
            Отменить
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            className="min-h-11"
            onPress={() => inputRef.current?.click()}
          >
            {profile.hasAvatar ? 'Заменить фото' : 'Загрузить фото'}
          </Button>
          {error && file && validateAvatar(file) === null && (
            <Button
              variant="secondary"
              className="min-h-11"
              onPress={() => void start(file)}
            >
              Повторить загрузку
            </Button>
          )}
          {profile.hasAvatar && (
            <Button
              variant="danger-soft"
              className="min-h-11"
              onPress={() => setConfirmOpen(true)}
            >
              Удалить фото
            </Button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        aria-label="Фото профиля"
        data-testid="avatar-input"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected && !uploading) void start(selected);
          // Тот же файл можно выбрать повторно после ошибки.
          e.target.value = '';
        }}
      />

      <AlertDialog.Backdrop
        isOpen={confirmOpen}
        onOpenChange={onConfirmOpenChange}
        isDismissable={!deleting}
        isKeyboardDismissDisabled={deleting}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Удалить фото профиля?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-3">
              <p>Вместо фото снова будут показываться инициалы.</p>
              {deleteError && (
                <p role="alert" className="text-sm text-danger">
                  {deleteError}
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
                variant="danger"
                className="min-h-11"
                isPending={deleting}
                onPress={() => void remove()}
              >
                {deleting ? 'Удаляем…' : 'Удалить фото'}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
