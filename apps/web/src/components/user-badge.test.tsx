import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

  it('у ссылки есть доступное имя', () => {
    render(<UserBadge name="Иван" email="ivan@example.com" />);

    expect(screen.getByRole('link', { name: /Профиль/ })).toBeInTheDocument();
  });
});
