import { getInitials } from '@/lib/initials';

interface Props {
  name: string | null;
  email: string;
  /** `md` — в шапке, `lg` — на странице профиля. */
  size?: 'md' | 'lg';
}

const SIZES = {
  md: 'size-11 text-base',
  lg: 'size-20 text-2xl',
} as const;

/** Круглая заглушка с инициалами пользователя. */
export function AvatarPlaceholder({ name, email, size = 'lg' }: Props) {
  return (
    <span
      aria-hidden="true"
      data-testid="avatar-placeholder"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground ${SIZES[size]}`}
    >
      {getInitials(name, email)}
    </span>
  );
}
