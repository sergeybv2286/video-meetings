import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { UserBadge } from './user-badge';

afterEach(cleanup);

describe('UserBadge', () => {
  it('показывает инициалы, имя и email со ссылкой на профиль', () => {
    render(<UserBadge name="Иван Петров" email="ivan@example.com" />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/profile');
    expect(screen.getByTestId('avatar-placeholder')).toHaveTextContent('ИП');
    expect(screen.getByTestId('user-name')).toHaveTextContent('Иван Петров');
    expect(screen.getByTestId('user-email')).toHaveTextContent(
      'ivan@example.com',
    );
  });

  it('без имени показывает email и его первую букву', () => {
    render(<UserBadge name={null} email="zed@example.com" />);

    expect(screen.getByTestId('avatar-placeholder')).toHaveTextContent('Z');
    expect(screen.queryByTestId('user-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('user-email')).toHaveTextContent(
      'zed@example.com',
    );
  });

  it('с аватаром показывает изображение', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:avatar');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(api, 'getAvatar').mockResolvedValue(new Blob(['x']));
    render(
      <UserBadge
        name="Иван"
        email="ivan@example.com"
        avatar={{ userId: 'u1', hasAvatar: true, avatarUpdatedAt: '1' }}
      />,
    );

    expect(await screen.findByTestId('avatar-image')).toHaveAttribute(
      'src',
      'blob:avatar',
    );
  });

  it('у ссылки есть доступное имя', () => {
    render(<UserBadge name="Иван" email="ivan@example.com" />);

    expect(screen.getByRole('link', { name: /Профиль/ })).toBeInTheDocument();
  });
});
