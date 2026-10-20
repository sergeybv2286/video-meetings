import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar } from './avatar';
import { api, ApiError } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return { ...original, api: { ...original.api, getAvatar: vi.fn() } };
});

const base = {
  userId: 'u1',
  name: 'Иван Петров',
  email: 'ivan@example.com',
  avatarUpdatedAt: '2026-10-01T10:00:00.000Z',
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:avatar');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Avatar', () => {
  it('без аватара показывает инициалы и не обращается к API', () => {
    render(<Avatar {...base} hasAvatar={false} />);

    expect(screen.getByTestId('avatar-placeholder')).toHaveTextContent('ИП');
    expect(api.getAvatar).not.toHaveBeenCalled();
  });

  it('с аватаром показывает круглое изображение', async () => {
    vi.mocked(api.getAvatar).mockResolvedValue(new Blob(['x']));
    render(<Avatar {...base} hasAvatar />);

    const img = await screen.findByTestId('avatar-image');
    expect(img).toHaveAttribute('src', 'blob:avatar');
    expect(img).toHaveClass('rounded-full', 'object-cover');
    expect(api.getAvatar).toHaveBeenCalledWith('u1');
    expect(screen.queryByTestId('avatar-placeholder')).not.toBeInTheDocument();
  });

  it('при ошибке загрузки остаются инициалы', async () => {
    vi.mocked(api.getAvatar).mockRejectedValue(new ApiError('Ошибка', 500));
    render(<Avatar {...base} hasAvatar />);

    await waitFor(() => expect(api.getAvatar).toHaveBeenCalled());
    expect(screen.getByTestId('avatar-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
  });

  it('перезапрашивает изображение при смене avatarUpdatedAt', async () => {
    vi.mocked(api.getAvatar).mockResolvedValue(new Blob(['x']));
    const { rerender } = render(<Avatar {...base} hasAvatar />);
    await screen.findByTestId('avatar-image');

    rerender(
      <Avatar {...base} hasAvatar avatarUpdatedAt="2026-10-02T10:00:00.000Z" />,
    );
    await waitFor(() => expect(api.getAvatar).toHaveBeenCalledTimes(2));
  });

  it('после удаления аватара возвращает инициалы', async () => {
    vi.mocked(api.getAvatar).mockResolvedValue(new Blob(['x']));
    const { rerender } = render(<Avatar {...base} hasAvatar />);
    await screen.findByTestId('avatar-image');

    rerender(<Avatar {...base} hasAvatar={false} avatarUpdatedAt={null} />);
    expect(screen.getByTestId('avatar-placeholder')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
  });
});
