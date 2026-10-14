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
    throw new ApiError(errorMessage(body), response.status);
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
  date: string;
  participants: string[];
  createdAt: string;
  hasFile: boolean;
}

export interface MeetingFile {
  id: string;
  meetingId: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: 'UPLOADED';
  uploadedAt: string;
}

function errorMessage(body: unknown): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' ? message : 'Что-то пошло не так';
}

/**
 * Загрузка файла напрямую в API (другой origin, CORS настроен на сервере). Через XHR, а не
 * fetch: только он отдаёт прогресс отправки. Отмена — через `signal`.
 */
export function uploadMeetingFile(
  meetingId: string,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<MeetingFile> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Загрузка отменена', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    xhr.open('POST', `${API_URL}/meetings/${meetingId}/file`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      cleanup();
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Ответ не JSON — покажем общее сообщение.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as MeetingFile);
        return;
      }
      if (xhr.status === 401 && token) clearSession();
      // Прокси/балансировщик может ответить не JSON (например, HTML на 413).
      const message =
        body === null && xhr.status === 413
          ? 'Файл слишком большой'
          : errorMessage(body);
      reject(new ApiError(message, xhr.status));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new ApiError('Не удалось связаться с сервером', 0));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('Загрузка отменена', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
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
  getMeeting: (id: string) => request<Meeting>(`/meetings/${id}`),
  /** Метаданные файла встречи; `null`, если файла нет. */
  getMeetingFile: async (id: string): Promise<MeetingFile | null> => {
    try {
      return await request<MeetingFile>(`/meetings/${id}/file`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // 404 и для «нет файла», и для «нет встречи» — встречу проверяет getMeeting.
        return null;
      }
      throw e;
    }
  },
  createMeeting: (title: string) =>
    request<Meeting>('/meetings', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
};
