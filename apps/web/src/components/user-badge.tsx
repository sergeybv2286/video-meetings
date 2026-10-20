import Link from 'next/link';
import { Avatar } from '@/components/avatar';
import { AvatarPlaceholder } from '@/components/avatar-placeholder';

export interface AvatarInfo {
  userId: string;
  hasAvatar: boolean;
  avatarUpdatedAt: string | null;
}

interface Props {
  name: string | null;
  email: string;
  /** Пока профиль не загружен — `null`, показываются инициалы. */
  avatar?: AvatarInfo | null;
}

/** Залогиненный пользователь в шапке: инициалы, имя и email; ссылка на профиль. */
export function UserBadge({ name, email, avatar = null }: Props) {
  return (
    <Link
      href="/profile"
      className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {avatar ? (
        <Avatar {...avatar} name={name} email={email} size="md" />
      ) : (
        <AvatarPlaceholder name={name} email={email} size="md" />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="sr-only">Профиль: </span>
        {name && (
          <strong data-testid="user-name" className="truncate">
            {name}
          </strong>
        )}
        <span
          data-testid="user-email"
          className={name ? 'truncate text-sm text-muted' : 'truncate'}
        >
          {email}
        </span>
      </span>
    </Link>
  );
}
