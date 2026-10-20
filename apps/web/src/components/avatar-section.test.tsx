import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarSection } from './avatar-section';
import { api, ApiError, uploadAvatar, type UserProfile } from '@/lib/api';
import { MAX_AVATAR_SIZE } from '@/lib/avatar-file';

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...original,
    uploadAvatar: vi.fn(),
    api: { ...original.api, deleteAvatar: vi.fn(), getAvatar: vi.fn() },
  };
});

const profile: UserProfile = {
  id: 'u1',
  email: 'ivan@example.com',
  name: 'Иван Петров',
  createdAt: '2026-10-01T10:00:00.000Z',
  hasAvatar: false,
  avatarUpdatedAt: null,
};
const withAvatar: UserProfile = {
  ...profile,
  hasAvatar: true,
  avatarUpdatedAt: '2026-10-02T10:00:00.000Z',
};
const result = {
  mimeType: 'image/png',
  size: 10,
  updatedAt: '2026-10-03T10:00:00.000Z',
};

function setup(initial: UserProfile = profile) {
  const onChanged = vi.fn();
  render(<AvatarSection profile={initial} onChanged={onChanged} />);
  const input = screen.getByTestId('avatar-input') as HTMLInputElement;
  const choose = (file: File) =>
    userEvent.upload(input, file, { applyAccept: false });
  return { onChanged, input, choose };
}

const png = () => new File(['x'], 'me.png', { type: 'image/png' });

async function confirmDelete() {
  await userEvent.click(screen.getByRole('button', { name: 'Удалить фото' }));
  await screen.findByRole('alertdialog');
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Удалить фото' }).at(-1)!,
  );
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.mocked(api.getAvatar).mockResolvedValue(new Blob(['x']));
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('AvatarSection', () => {
  it('без аватара: подсказка, «Загрузить фото», нет «Удалить»', () => {
    setup();
    expect(screen.getByText(/JPEG, PNG или WebP, до 5 МБ/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Загрузить фото' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить фото' })).toBeNull();
  });

  it('с аватаром: «Заменить фото» и «Удалить фото»', () => {
    setup(withAvatar);
    expect(
      screen.getByRole('button', { name: 'Заменить фото' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Удалить фото' }),
    ).toBeInTheDocument();
  });

  it('загружает файл и сообщает об обновлённом профиле', async () => {
    const { choose, onChanged } = setup();
    vi.mocked(uploadAvatar).mockResolvedValue(result);

    await choose(png());

    expect(uploadAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'me.png' }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
    await vi.waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith({
        ...profile,
        hasAvatar: true,
        avatarUpdatedAt: result.updatedAt,
      }),
    );
  });

  it('недопустимый тип: ошибка, запрос не отправляется', async () => {
    const { choose } = setup();
    await choose(new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Формат не поддерживается',
    );
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('файл больше 5 МБ: ошибка, запрос не отправляется', async () => {
    const { choose } = setup();
    const big = png();
    Object.defineProperty(big, 'size', { value: MAX_AVATAR_SIZE + 1 });
    await choose(big);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'слишком большой',
    );
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('ошибка сервера: сообщение и «Повторить загрузку», профиль не меняется', async () => {
    const { choose, onChanged } = setup();
    vi.mocked(uploadAvatar).mockRejectedValueOnce(
      new ApiError('Не удалось связаться с сервером', 0),
    );
    await choose(png());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось связаться с сервером',
    );
    expect(onChanged).not.toHaveBeenCalled();

    vi.mocked(uploadAvatar).mockResolvedValueOnce(result);
    await userEvent.click(
      screen.getByRole('button', { name: /Повторить загрузку/ }),
    );
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(uploadAvatar).toHaveBeenCalledTimes(2);
  });

  it('удаление требует подтверждения', async () => {
    const { onChanged } = setup(withAvatar);
    vi.mocked(api.deleteAvatar).mockResolvedValue(undefined);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить фото' }));
    expect(api.deleteAvatar).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Удалить фото профиля?',
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Удалить фото' }).at(-1)!,
    );

    await vi.waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith({
        ...withAvatar,
        hasAvatar: false,
        avatarUpdatedAt: null,
      }),
    );
    expect(api.deleteAvatar).toHaveBeenCalledTimes(1);
  });

  it('ошибка удаления видна в диалоге, профиль не меняется', async () => {
    const { onChanged } = setup(withAvatar);
    vi.mocked(api.deleteAvatar).mockRejectedValue(
      new ApiError('Сбой сервера', 500),
    );
    await confirmDelete();
    expect(await screen.findByText('Сбой сервера')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('404 при удалении считается успехом', async () => {
    const { onChanged } = setup(withAvatar);
    vi.mocked(api.deleteAvatar).mockRejectedValue(new ApiError('Нет', 404));
    await confirmDelete();
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });
});
