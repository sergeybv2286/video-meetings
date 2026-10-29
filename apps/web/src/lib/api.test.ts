import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiError,
  downloadMeetingFile,
  downloadTranscription,
  uploadMeetingFile,
} from './api';
import { getToken } from './session';

vi.mock('./session', () => ({
  getToken: vi.fn(() => 'token-1'),
  clearSession: vi.fn(),
}));

const { clearSession } = await import('./session');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api: удаление и 204', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('deleteMeetingFile шлёт DELETE с токеном и принимает 204 без тела', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.deleteMeetingFile('m1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/meetings/m1/file');
    expect(init.method).toBe('DELETE');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer token-1',
    );
  });

  it('deleteMeetingFile: 404 → ApiError со статусом и русским сообщением сервера', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ message: 'Файл не найден' }, 404)),
    );

    const error = await api.deleteMeetingFile('m1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: 'Файл не найден' });
  });

  it('успешный ответ 200 без тела не ломает запрос', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 200 })),
    );

    await expect(api.deleteMeetingFile('m1')).resolves.toBeUndefined();
  });

  it('заголовки: принимает Headers, Content-Type по умолчанию, токен не перебить', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await api.getMeeting('m1');
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('getMeetingFile: 404 → null, другие ошибки пробрасываются', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Файл не найден' }, 404))
      .mockResolvedValueOnce(jsonResponse({ message: 'Сбой' }, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getMeetingFile('m1')).resolves.toBeNull();
    await expect(api.getMeetingFile('m1')).rejects.toMatchObject({
      status: 500,
    });
  });

  it('сетевая ошибка → ApiError со статусом 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));

    await expect(api.deleteMeetingFile('m1')).rejects.toMatchObject({
      status: 0,
      message: 'Не удалось связаться с сервером',
    });
  });

  it('401 при наличии токена сбрасывает сессию', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401)),
    );

    await api.deleteMeetingFile('m1').catch(() => undefined);

    expect(clearSession).toHaveBeenCalled();
  });
});

describe('downloadMeetingFile', () => {
  let click: () => void;

  beforeEach(() => {
    click = vi.fn<() => void>();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('запрашивает файл с токеном и сохраняет его под исходным именем', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('содержимое', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const anchors: HTMLAnchorElement[] = [];
    const append = document.body.append.bind(document.body);
    vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
      anchors.push(...(nodes as HTMLAnchorElement[]));
      append(...nodes);
    });

    await downloadMeetingFile('m1', 'Запись встречи.mp4');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:3001/meetings/m1/file/download',
    );
    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization'),
    ).toBe('Bearer token-1');
    expect(click).toHaveBeenCalledTimes(1);
    expect(anchors[0].download).toBe('Запись встречи.mp4');
    expect(anchors[0].href).toBe('blob:test');
    // ссылка не остаётся в документе
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('обрыв при чтении тела → ApiError, файл не сохраняется', async () => {
    const response = new Response('x', { status: 200 });
    vi.spyOn(response, 'blob').mockRejectedValue(new TypeError('network'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(downloadMeetingFile('m1', 'a.txt')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('соединение прервано'),
    });
    expect(click).not.toHaveBeenCalled();
  });

  it('при ошибке сервера бросает ApiError и ничего не сохраняет', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ message: 'Файл не найден' }, 404)),
    );

    await expect(downloadMeetingFile('m1', 'a.txt')).rejects.toMatchObject({
      status: 404,
      message: 'Файл не найден',
    });
    expect(click).not.toHaveBeenCalled();
  });
});

describe('uploadMeetingFile', () => {
  class FakeXhr {
    static last: FakeXhr;
    method = '';
    url = '';
    headers: Record<string, string> = {};
    status = 0;
    responseText = '';
    sent = false;
    aborted = false;
    upload: { onprogress: ((e: unknown) => void) | null } = {
      onprogress: null,
    };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    constructor() {
      FakeXhr.last = this;
    }
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send() {
      this.sent = true;
    }
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
    respond(status: number, body: string) {
      this.status = status;
      this.responseText = body;
      this.onload?.();
    }
  }

  const file = new File(['x'], 'a.vtt', { type: 'text/vtt' });

  beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXhr));
  afterEach(() => vi.unstubAllGlobals());

  it('по умолчанию POST, с токеном; прогресс в процентах; результат — метаданные', async () => {
    const onProgress = vi.fn();
    const promise = uploadMeetingFile('m1', file, onProgress);
    const xhr = FakeXhr.last;

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.respond(201, JSON.stringify({ id: 'f1' }));

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('http://localhost:3001/meetings/m1/file');
    expect(xhr.headers.Authorization).toBe('Bearer token-1');
    expect(onProgress).toHaveBeenCalledWith(25);
    await expect(promise).resolves.toEqual({ id: 'f1' });
  });

  it('замена идёт методом PUT', async () => {
    const promise = uploadMeetingFile('m1', file, vi.fn(), undefined, 'PUT');
    FakeXhr.last.respond(200, '{}');
    await promise;

    expect(FakeXhr.last.method).toBe('PUT');
  });

  it('ошибка сервера: сообщение из JSON и статус', async () => {
    const promise = uploadMeetingFile('m1', file, vi.fn());
    FakeXhr.last.respond(
      415,
      JSON.stringify({
        message: 'Содержимое файла не соответствует его расширению',
      }),
    );

    await expect(promise).rejects.toMatchObject({
      status: 415,
      message: 'Содержимое файла не соответствует его расширению',
    });
  });

  it('413 с не-JSON ответом прокси → понятное сообщение', async () => {
    const promise = uploadMeetingFile('m1', file, vi.fn());
    FakeXhr.last.respond(413, '<html>Request Entity Too Large</html>');

    await expect(promise).rejects.toMatchObject({
      status: 413,
      message: 'Файл слишком большой',
    });
  });

  it('401 сбрасывает сессию', async () => {
    const promise = uploadMeetingFile('m1', file, vi.fn());
    FakeXhr.last.respond(401, JSON.stringify({ message: 'Unauthorized' }));

    await promise.catch(() => undefined);
    expect(clearSession).toHaveBeenCalled();
  });

  it('обрыв сети → ApiError со статусом 0', async () => {
    const promise = uploadMeetingFile('m1', file, vi.fn());
    FakeXhr.last.onerror?.();

    await expect(promise).rejects.toMatchObject({ status: 0 });
  });

  it('отмена через signal прерывает запрос с AbortError', async () => {
    const controller = new AbortController();
    const promise = uploadMeetingFile('m1', file, vi.fn(), controller.signal);

    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.last.aborted).toBe(true);
  });

  it('уже отменённый signal: запрос не отправляется', async () => {
    const controller = new AbortController();
    controller.abort();
    const previous = FakeXhr.last;

    await expect(
      uploadMeetingFile('m1', file, vi.fn(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.last).toBe(previous);
  });

  it('без токена заголовок Authorization не ставится', async () => {
    vi.mocked(getToken).mockReturnValueOnce(null);
    const promise = uploadMeetingFile('m1', file, vi.fn());
    FakeXhr.last.respond(201, '{}');
    await promise;

    expect(FakeXhr.last.headers.Authorization).toBeUndefined();
  });
});

describe('транскрибация', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('getTranscription запрашивает статус и текст с токеном', async () => {
    const body = {
      status: 'DONE',
      text: 'Привет',
      error: null,
      completedAt: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getTranscription('m1')).resolves.toEqual(body);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:3001/meetings/m1/file/transcription',
    );
    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization'),
    ).toBe('Bearer token-1');
  });

  it('retryTranscription шлёт POST на /retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'QUEUED',
        text: null,
        error: null,
        completedAt: null,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.retryTranscription('m1');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:3001/meetings/m1/file/transcription/retry',
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('ошибка API приходит русским ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            message:
              'Повторить можно только транскрибацию со статусом «Ошибка»',
          },
          409,
        ),
      ),
    );

    await expect(api.retryTranscription('m1')).rejects.toMatchObject({
      status: 409,
      message: 'Повторить можно только транскрибацию со статусом «Ошибка»',
    });
  });

  describe('downloadTranscription', () => {
    it('скачивает .txt под именем исходного файла без расширения', async () => {
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:txt'),
        revokeObjectURL: vi.fn(),
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        () => {},
      );
      const fetchMock = vi.fn().mockResolvedValue(new Response('текст'));
      vi.stubGlobal('fetch', fetchMock);
      const anchors: HTMLAnchorElement[] = [];
      const append = document.body.append.bind(document.body);
      vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
        anchors.push(...(nodes as HTMLAnchorElement[]));
        append(...nodes);
      });

      await downloadTranscription('m1', 'Итоги встречи.final.mp4');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://localhost:3001/meetings/m1/file/transcription/download',
      );
      expect(anchors[0].download).toBe('Итоги встречи.final.txt');
    });

    it('обрыв при чтении тела → ApiError', async () => {
      const response = new Response('x');
      vi.spyOn(response, 'blob').mockRejectedValue(new TypeError('network'));
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

      await expect(downloadTranscription('m1', 'a.mp3')).rejects.toMatchObject({
        status: 0,
        message: expect.stringContaining('соединение прервано'),
      });
    });
  });
});
