'use client';

import { useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'vm.session';

export interface Session {
  token: string;
  email: string;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  listeners.forEach((listener) => listener());
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((listener) => listener());
}

export function getToken(): string | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as Session).token;
  } catch {
    return null;
  }
}

/**
 * `loading` is true until the client has read localStorage
 * (the server and the first client render have no access to it).
 */
export function useSession(): { session: Session | null; loading: boolean } {
  const raw = useSyncExternalStore(subscribe, readRaw, () => undefined);

  const session = useMemo<Session | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }, [raw]);

  return { session, loading: raw === undefined };
}
