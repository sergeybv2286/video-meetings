import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteAccountSection } from './delete-account-section';
import { api, ApiError } from '@/lib/api';
import { clearSession } from '@/lib/session';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/session', () => ({ clearSession: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return { ...original, api: { ...original.api, deleteAccount: vi.fn() } };
});

async function openAndConfirm(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
) {
  await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
  await user.type(await screen.findByLabelText('Пароль'), password);
  const dialog = screen.getByRole('alertdialog');
  const buttons = dialog.querySelectorAll('button');
  await user.click(buttons[buttons.length - 1]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('удаление аккаунта', () => {
  it('при верном пароле удаляет аккаунт, выходит и ведёт на вход', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deleteAccount).mockResolvedValue(undefined);
    render(<DeleteAccountSection />);

    await openAndConfirm(user, 'secret123');

    expect(api.deleteAccount).toHaveBeenCalledWith('secret123');
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(clearSession).toHaveBeenCalled();
  });

  it('при неверном пароле показывает ошибку, не выходит и оставляет диалог', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deleteAccount).mockRejectedValue(
      new ApiError('Неверный пароль', 400),
    );
    render(<DeleteAccountSection />);

    await openAndConfirm(user, 'wrong-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверный пароль',
    );
    expect(clearSession).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('кнопка подтверждения недоступна, пока пароль не введён', async () => {
    const user = userEvent.setup();
    render(<DeleteAccountSection />);

    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    const dialog = await screen.findByRole('alertdialog');
    const buttons = dialog.querySelectorAll('button');
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });
});
