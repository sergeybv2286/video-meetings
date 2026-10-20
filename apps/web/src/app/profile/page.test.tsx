import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './page';
import { api, ApiError, type UserProfile } from '@/lib/api';
import { useSession } from '@/lib/session';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/session', () => ({ useSession: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...original,
    api: { ...original.api, getMe: vi.fn(), getAvatar: vi.fn() },
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

function signedIn() {
  vi.mocked(useSession).mockReturnValue({
    session: { token: 't', email: 'ivan@example.com' },
    loading: false,
  });
}

afterEach(cleanup);

describe('страница профиля', () => {
  it('показывает имя, email, инициалы и кнопку «Редактировать»', async () => {
    signedIn();
    vi.mocked(api.getMe).mockResolvedValue(profile);
    render(<ProfilePage />);

    expect(await screen.findByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('ivan@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-placeholder')).toHaveTextContent('ИП');
    expect(screen.getByRole('link', { name: 'Редактировать' })).toHaveAttribute(
      'href',
      '/profile/edit',
    );
  });

  it('без имени показывает инициалы email', async () => {
    signedIn();
    vi.mocked(api.getMe).mockResolvedValue({ ...profile, name: null });
    render(<ProfilePage />);

    expect(await screen.findByTestId('avatar-placeholder')).toHaveTextContent(
      'I',
    );
    expect(screen.getByText('Имя не указано')).toBeInTheDocument();
  });

  it('с аватаром показывает изображение вместо инициалов', async () => {
    signedIn();
    URL.createObjectURL = vi.fn(() => 'blob:avatar');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(api.getMe).mockResolvedValue({
      ...profile,
      hasAvatar: true,
      avatarUpdatedAt: '2026-10-02T10:00:00.000Z',
    });
    vi.mocked(api.getAvatar).mockResolvedValue(new Blob(['x']));
    render(<ProfilePage />);

    expect(await screen.findByTestId('avatar-image')).toHaveAttribute(
      'src',
      'blob:avatar',
    );
    expect(api.getAvatar).toHaveBeenCalledWith('u1');
    expect(screen.queryByTestId('avatar-placeholder')).not.toBeInTheDocument();
  });

  it('неавторизованного перенаправляет на вход и не запрашивает профиль', async () => {
    vi.mocked(useSession).mockReturnValue({ session: null, loading: false });
    render(<ProfilePage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(api.getMe).not.toHaveBeenCalled();
  });

  it('пока сессия читается, не перенаправляет', () => {
    vi.mocked(useSession).mockReturnValue({ session: null, loading: true });
    render(<ProfilePage />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('показывает ошибку загрузки', async () => {
    signedIn();
    vi.mocked(api.getMe).mockRejectedValue(
      new ApiError('Не удалось связаться с сервером', 0),
    );
    render(<ProfilePage />);

    expect(
      await screen.findByText('Не удалось связаться с сервером'),
    ).toBeInTheDocument();
  });
});
