'use client';

import { useEffect, useState } from 'react';
import { AvatarPlaceholder } from '@/components/avatar-placeholder';
import { api } from '@/lib/api';

interface Props {
  userId: string | null;
  name: string | null;
  email: string;
  hasAvatar: boolean;
  /** Меняется при замене аватара и перезапрашивает изображение. */
  avatarUpdatedAt: string | null;
  size?: 'md' | 'lg';
}

const SIZES = { md: 'size-11', lg: 'size-20' } as const;

/** Круглое изображение аватара или заглушка с инициалами (нет аватара, загрузка, ошибка). */
export function Avatar({
  userId,
  name,
  email,
  hasAvatar,
  avatarUpdatedAt,
  size = 'lg',
}: Props) {
  const key = hasAvatar && userId ? `${userId}:${avatarUpdatedAt}` : null;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!key || !userId) return;
    let cancelled = false;
    let url: string | null = null;
    api
      .getAvatar(userId)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setLoaded({ key, url });
      })
      .catch(() => {
        // Не удалось загрузить — остаются инициалы.
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, userId]);

  if (key && loaded?.key === key) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image не подходит
      <img
        src={loaded.url}
        alt=""
        data-testid="avatar-image"
        className={`shrink-0 rounded-full object-cover ${SIZES[size]}`}
      />
    );
  }
  return <AvatarPlaceholder name={name} email={email} size={size} />;
}
