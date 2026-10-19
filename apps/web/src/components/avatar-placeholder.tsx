import { getInitials } from '@/lib/initials';

interface Props {
  name: string | null;
  email: string;
  className?: string;
}

/** Круглая заглушка с инициалами пользователя. */
export function AvatarPlaceholder({ name, email, className = '' }: Props) {
  return (
    <span
      aria-hidden="true"
      data-testid="avatar-placeholder"
      className={`inline-flex size-20 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-accent-foreground ${className}`}
    >
      {getInitials(name, email)}
    </span>
  );
}
