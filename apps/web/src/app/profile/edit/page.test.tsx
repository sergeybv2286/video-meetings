import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditProfilePage from './page';
import { api, type UserProfile } from '@/lib/api';
import { getToken, saveSession, useSession } from '@/lib/session';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/session', () => ({
  useSession: vi.fn(),
  saveSession: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...original,
    api: { ...original.api, getMe: vi.fn(), updateMe: vi.fn() },
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

afterEach(cleanup);

describe('страница редактирования профиля', () => {
  it('загружает профиль и показывает форму', async () => {
    vi.mocked(useSession).mockReturnValue({
      session: { token: 't', email: 'ivan@example.com' },
      loading: false,
    });
    vi.mocked(api.getMe).mockResolvedValue(profile);
    render(<EditProfilePage />);

    expect(await screen.findByLabelText('Имя')).toHaveValue('Иван Петров');
    expect(screen.getByRole('link', { name: /К профилю/ })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('неавторизованного перенаправляет на вход и не запрашивает профиль', async () => {
    vi.mocked(useSession).mockReturnValue({ session: null, loading: false });
    render(<EditProfilePage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(api.getMe).not.toHaveBeenCalled();
  });

  it('после сохранения обновляет email в сессии (токен остаётся)', async () => {
    vi.mocked(useSession).mockReturnValue({
      session: { token: 't', email: 'ivan@example.com' },
      loading: false,
    });
    vi.mocked(getToken).mockReturnValue('t');
    vi.mocked(api.getMe).mockResolvedValue(profile);
    vi.mocked(api.updateMe).mockResolvedValue({
      ...profile,
      email: 'new@example.com',
    });
    const user = userEvent.setup();
    render(<EditProfilePage />);

    const email = await screen.findByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'new@example.com');
    await user.type(
      screen.getByLabelText('Текущий пароль (для смены email)'),
      'secret123',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(saveSession).toHaveBeenCalledWith({
        token: 't',
        email: 'new@example.com',
      }),
    );
  });

  it('не восстанавливает сессию, если пользователь вышел во время сохранения', async () => {
    vi.mocked(useSession).mockReturnValue({
      session: { token: 't', email: 'ivan@example.com' },
      loading: false,
    });
    // Токена в хранилище уже нет (выход или 401 во время PATCH).
    vi.mocked(getToken).mockReturnValue(null);
    vi.mocked(api.getMe).mockResolvedValue(profile);
    vi.mocked(api.updateMe).mockResolvedValue({
      ...profile,
      email: 'new@example.com',
    });
    const user = userEvent.setup();
    render(<EditProfilePage />);

    const email = await screen.findByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'new@example.com');
    await user.type(
      screen.getByLabelText('Текущий пароль (для смены email)'),
      'secret123',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await screen.findByText('Изменения сохранены');
    expect(saveSession).not.toHaveBeenCalled();
  });
});
