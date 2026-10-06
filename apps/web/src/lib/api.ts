import { clearSession, getToken } from './session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Не удалось связаться с сервером', 0);
  }

  if (!response.ok) {
    // An expired/invalid token on a protected call means the user is logged out.
    if (response.status === 401 && token) clearSession();
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? 'Что-то пошло не так');
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export interface AuthResult {
  accessToken: string;
  user: { id: string; email: string };
}

export interface Meeting {
  id: string;
  title: string;
  createdAt: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    request<AuthResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  listMeetings: () => request<Meeting[]>('/meetings'),
  createMeeting: (title: string) =>
    request<Meeting>('/meetings', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
};
