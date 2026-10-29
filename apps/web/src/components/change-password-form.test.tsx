import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from './change-password-form';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return { ...original, api: { ...original.api, changePassword: vi.fn() } };
});

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  current: string,
  next: string,
) {
  await user.type(screen.getByLabelText('Текущий пароль'), current);
  await user.type(screen.getByLabelText('Новый пароль'), next);
  await user.click(screen.getByRole('button', { name: 'Сменить пароль' }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('форма смены пароля', () => {
  it('меняет пароль, показывает подтверждение и очищает поля', async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePassword).mockResolvedValue({
      accessToken: 'new-token',
      user: { id: 'u1', email: 'a@example.com' },
    });
    render(<ChangePasswordForm />);

    await fill(user, 'secret123', 'newsecret456');

    expect(api.changePassword).toHaveBeenCalledWith(
      'secret123',
      'newsecret456',
    );
    expect(await screen.findByText('Пароль изменён')).toBeInTheDocument();
    // Старые токены отозваны: новый токен заменяет сессию.
    expect(getToken()).toBe('new-token');
    expect(screen.getByLabelText('Текущий пароль')).toHaveValue('');
    expect(screen.getByLabelText('Новый пароль')).toHaveValue('');
  });

  it('неверный старый пароль показывает ошибку сервера', async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePassword).mockRejectedValue(
      new ApiError('Неверный текущий пароль', 400),
    );
    render(<ChangePasswordForm />);

    await fill(user, 'wrong-pass', 'newsecret456');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверный текущий пароль',
    );
    expect(screen.queryByText('Пароль изменён')).not.toBeInTheDocument();
  });

  it('короткий новый пароль не отправляется и даёт русское сообщение', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await fill(user, 'secret123', '123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Новый пароль должен быть не короче 6 символов',
    );
    expect(api.changePassword).not.toHaveBeenCalled();
  });
});
