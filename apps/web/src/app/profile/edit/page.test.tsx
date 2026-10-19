import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditProfilePage from './page';
import { api, type UserProfile } from '@/lib/api';
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
    api: { ...original.api, getMe: vi.fn(), updateMe: vi.fn() },
  };
});

const profile: UserProfile = {
  id: 'u1',
  email: 'ivan@example.com',
  name: 'Иван Петров',
  createdAt: '2026-10-01T10:00:00.000Z',
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
});
