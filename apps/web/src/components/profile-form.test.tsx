import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileForm } from './profile-form';
import { api, ApiError, type UserProfile } from '@/lib/api';

const PASSWORD_LABEL = 'Текущий пароль (для смены email)';

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return { ...original, api: { ...original.api, updateMe: vi.fn() } };
});

const profile: UserProfile = {
  id: 'u1',
  email: 'ivan@example.com',
  name: 'Иван Петров',
  createdAt: '2026-10-01T10:00:00.000Z',
  hasAvatar: false,
  avatarUpdatedAt: null,
};

function setup(initial: UserProfile = profile) {
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(<ProfileForm profile={initial} onSaved={onSaved} />);
  return { user, onSaved };
}

afterEach(cleanup);

describe('форма имени и email', () => {
  it('подставляет текущие имя и email', () => {
    setup();
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван Петров');
    expect(screen.getByLabelText('Email')).toHaveValue('ivan@example.com');
  });

  it('сохраняет изменения и показывает подтверждение', async () => {
    const { user, onSaved } = setup();
    const saved = { ...profile, name: 'Пётр', email: 'petr@example.com' };
    vi.mocked(api.updateMe).mockResolvedValue(saved);

    await user.clear(screen.getByLabelText('Имя'));
    await user.type(screen.getByLabelText('Имя'), 'Пётр');
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'petr@example.com');
    await user.type(screen.getByLabelText(PASSWORD_LABEL), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(api.updateMe).toHaveBeenCalledWith({
      name: 'Пётр',
      email: 'petr@example.com',
      password: 'secret123',
    });
    expect(await screen.findByText('Изменения сохранены')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('поле пароля появляется только при смене email и без него пароль не отправляется', async () => {
    const { user } = setup();
    vi.mocked(api.updateMe).mockResolvedValue(profile);
    expect(screen.queryByLabelText(PASSWORD_LABEL)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'x');
    expect(screen.getByLabelText(PASSWORD_LABEL)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), '{Backspace}');
    expect(screen.queryByLabelText(PASSWORD_LABEL)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(api.updateMe).toHaveBeenCalledWith({
      name: 'Иван Петров',
      email: 'ivan@example.com',
    });
  });

  it('очистка имени отправляет пустую строку (сброс имени)', async () => {
    const { user, onSaved } = setup();
    vi.mocked(api.updateMe).mockResolvedValue({ ...profile, name: null });

    await user.clear(screen.getByLabelText('Имя'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(api.updateMe).toHaveBeenCalledWith({
      name: '',
      email: 'ivan@example.com',
    });
    expect(await screen.findByText('Изменения сохранены')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith({ ...profile, name: null });
    expect(screen.getByLabelText('Имя')).toHaveValue('');
  });

  it('409 показывает русское сообщение о занятом email и не вызывает onSaved', async () => {
    const { user, onSaved } = setup();
    vi.mocked(api.updateMe).mockRejectedValue(
      new ApiError('Пользователь с таким email уже существует', 409),
    );

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'busy@example.com');
    await user.type(screen.getByLabelText(PASSWORD_LABEL), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Этот email уже занят',
    );
    expect(screen.queryByText('Изменения сохранены')).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('прочие ошибки API показывает как есть', async () => {
    const { user } = setup();
    vi.mocked(api.updateMe).mockRejectedValue(
      new ApiError('Не удалось связаться с сервером', 0),
    );

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось связаться с сервером',
    );
  });

  it('некорректный email не отправляется на сервер', async () => {
    const { user } = setup();

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'не-email');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(api.updateMe).not.toHaveBeenCalled();
  });

  it('при повторной правке скрывает прежнее подтверждение', async () => {
    const { user } = setup();
    vi.mocked(api.updateMe).mockResolvedValue(profile);

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Изменения сохранены')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Имя'), 'а');
    expect(screen.queryByText('Изменения сохранены')).not.toBeInTheDocument();
  });

  it('ошибка в onSaved не превращает успешное сохранение в ошибку', async () => {
    const { user, onSaved } = setup();
    onSaved.mockImplementation(() => {
      throw new Error('storage quota');
    });
    vi.mocked(api.updateMe).mockResolvedValue(profile);

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Изменения сохранены')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('после сохранения показывает значения, нормализованные сервером', async () => {
    const { user } = setup();
    vi.mocked(api.updateMe).mockResolvedValue({
      ...profile,
      name: 'Иван',
      email: 'user@example.com',
    });

    await user.clear(screen.getByLabelText('Имя'));
    await user.type(screen.getByLabelText('Имя'), '   Иван   ');
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'USER@Example.com');
    await user.type(screen.getByLabelText(PASSWORD_LABEL), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await screen.findByText('Изменения сохранены');
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван');
    expect(screen.getByLabelText('Email')).toHaveValue('user@example.com');
  });

  it('повторное нажатие во время отправки не шлёт второй запрос', async () => {
    const { user } = setup();
    let resolve!: (value: UserProfile) => void;
    vi.mocked(api.updateMe).mockReturnValue(
      new Promise<UserProfile>((r) => (resolve = r)),
    );

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await user.type(screen.getByLabelText('Имя'), '{Enter}');

    expect(api.updateMe).toHaveBeenCalledTimes(1);
    resolve(profile);
    await screen.findByText('Изменения сохранены');
  });
});
