import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POLL_INTERVAL_MS,
  TranscriptionSection,
} from './transcription-section';
import {
  api,
  ApiError,
  downloadTranscription,
  type MeetingFile,
  type Transcription,
} from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...original,
    downloadTranscription: vi.fn(),
    api: {
      ...original.api,
      getTranscription: vi.fn(),
      retryTranscription: vi.fn(),
    },
  };
});

const file: MeetingFile = {
  id: 'f1',
  meetingId: 'm1',
  originalName: 'Запись встречи.mp4',
  mimeType: 'video/mp4',
  size: 1024,
  status: 'UPLOADED',
  uploadedAt: '2026-10-14T10:00:00.000Z',
  transcriptionStatus: 'QUEUED',
};

const tr = (patch: Partial<Transcription>): Transcription => ({
  status: 'QUEUED',
  text: null,
  error: null,
  completedAt: null,
  ...patch,
});

/** Дожидается завершения асинхронных промисов под фейковыми таймерами. */
const flush = () => act(async () => {});
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function setup(f: MeetingFile = file) {
  return render(<TranscriptionSection file={f} />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('TranscriptionSection: статусы', () => {
  it('не показывает ничего для файла не MP4/MP3', async () => {
    const { container } = setup({ ...file, transcriptionStatus: null });
    await flush();

    expect(container).toBeEmptyDOMElement();
    expect(api.getTranscription).not.toHaveBeenCalled();
  });

  it.each([
    ['QUEUED', 'В очереди'],
    ['PROCESSING', 'В процессе'],
  ] as const)('%s → «%s»', async (status, label) => {
    vi.mocked(api.getTranscription).mockResolvedValue(tr({ status }));
    setup({ ...file, transcriptionStatus: status });
    await flush();

    expect(screen.getByTestId('transcription-status')).toHaveTextContent(label);
    expect(screen.queryByText('Скачать .txt')).not.toBeInTheDocument();
    expect(screen.queryByText('Повторить')).not.toBeInTheDocument();
  });

  it('«Готово»: показывает текст и кнопку «Скачать .txt»', async () => {
    vi.mocked(api.getTranscription).mockResolvedValue(
      tr({ status: 'DONE', text: 'Привет,\nмир' }),
    );
    setup({ ...file, transcriptionStatus: 'DONE' });
    await flush();

    expect(screen.getByTestId('transcription-status')).toHaveTextContent(
      'Готово',
    );
    expect(screen.getByTestId('transcription-text')).toHaveTextContent(
      'Привет, мир',
    );
    expect(
      screen.getByRole('button', { name: 'Скачать .txt' }),
    ).toBeInTheDocument();
  });

  it('«Готово» с пустым текстом: сообщение, что речи нет', async () => {
    vi.mocked(api.getTranscription).mockResolvedValue(
      tr({ status: 'DONE', text: '' }),
    );
    setup({ ...file, transcriptionStatus: 'DONE' });
    await flush();

    expect(screen.getByTestId('transcription-text')).toHaveTextContent(
      'В файле не найдено речи.',
    );
  });

  it('«Ошибка»: сообщение сервера и кнопка «Повторить»', async () => {
    vi.mocked(api.getTranscription).mockResolvedValue(
      tr({ status: 'FAILED', error: 'Файл повреждён' }),
    );
    setup({ ...file, transcriptionStatus: 'FAILED' });
    await flush();

    expect(screen.getByTestId('transcription-status')).toHaveTextContent(
      'Ошибка',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Файл повреждён');
    expect(
      screen.getByRole('button', { name: 'Повторить' }),
    ).toBeInTheDocument();
  });
});

describe('TranscriptionSection: опрос', () => {
  it('опрашивает API, пока задача в работе, и останавливается на «Готово»', async () => {
    vi.mocked(api.getTranscription)
      .mockResolvedValueOnce(tr({ status: 'QUEUED' }))
      .mockResolvedValueOnce(tr({ status: 'PROCESSING' }))
      .mockResolvedValue(tr({ status: 'DONE', text: 'Готово!' }));
    setup();
    await flush();
    expect(api.getTranscription).toHaveBeenCalledTimes(1);

    await advance(POLL_INTERVAL_MS);
    expect(screen.getByTestId('transcription-status')).toHaveTextContent(
      'В процессе',
    );

    await advance(POLL_INTERVAL_MS);
    expect(screen.getByTestId('transcription-status')).toHaveTextContent(
      'Готово',
    );
    expect(api.getTranscription).toHaveBeenCalledTimes(3);

    await advance(POLL_INTERVAL_MS * 5);
    expect(api.getTranscription).toHaveBeenCalledTimes(3);
  });

  it('останавливается на «Ошибка»', async () => {
    vi.mocked(api.getTranscription).mockResolvedValue(
      tr({ status: 'FAILED', error: 'x' }),
    );
    setup();
    await flush();

    await advance(POLL_INTERVAL_MS * 5);

    expect(api.getTranscription).toHaveBeenCalledTimes(1);
  });

  it('не опрашивает готовую задачу', async () => {
    vi.mocked(api.getTranscription).mockResolvedValue(
      tr({ status: 'DONE', text: 'a' }),
    );
    setup({ ...file, transcriptionStatus: 'DONE' });
    await flush();

    await advance(POLL_INTERVAL_MS * 5);

    expect(api.getTranscription).toHaveBeenCalledTimes(1);
  });

  it('при размонтировании опрос прекращается', async () => {
    vi.mocked(api.getTranscription).mockResolvedValue(
      tr({ status: 'PROCESSING' }),
    );
    const { unmount } = setup();
    await flush();

    unmount();
    await advance(POLL_INTERVAL_MS * 5);

    expect(api.getTranscription).toHaveBeenCalledTimes(1);
  });

  it('сетевой сбой при опросе показывает ошибку, но опрос продолжается', async () => {
    vi.mocked(api.getTranscription)
      .mockRejectedValueOnce(new ApiError('Не удалось связаться с сервером', 0))
      .mockResolvedValue(tr({ status: 'DONE', text: 'Текст' }));
    setup();
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось связаться с сервером',
    );

    await advance(POLL_INTERVAL_MS);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('transcription-text')).toHaveTextContent('Текст');
  });

  it('замена файла (новый key) сбрасывает состояние и начинает новый опрос', async () => {
    vi.mocked(api.getTranscription).mockResolvedValueOnce(
      tr({ status: 'DONE', text: 'Старый текст' }),
    );
    const { rerender } = render(
      <TranscriptionSection
        key="a"
        file={{ ...file, transcriptionStatus: 'DONE' }}
      />,
    );
    await flush();
    expect(screen.getByTestId('transcription-text')).toHaveTextContent(
      'Старый текст',
    );

    vi.mocked(api.getTranscription).mockResolvedValue(tr({ status: 'QUEUED' }));
    rerender(
      <TranscriptionSection
        key="b"
        file={{ ...file, transcriptionStatus: 'QUEUED' }}
      />,
    );
    await flush();

    expect(screen.queryByText('Старый текст')).not.toBeInTheDocument();
    expect(screen.getByTestId('transcription-status')).toHaveTextContent(
      'В очереди',
    );
  });

  it('для файла без транскрибации после замены на PDF секция исчезает', async () => {
    vi.mocked(api.getTranscription).mockResolvedValue(
      tr({ status: 'DONE', text: 'a' }),
    );
    const { rerender, container } = render(
      <TranscriptionSection
        key="a"
        file={{ ...file, transcriptionStatus: 'DONE' }}
      />,
    );
    await flush();

    rerender(
      <TranscriptionSection
        key="b"
        file={{ ...file, transcriptionStatus: null }}
      />,
    );
    await flush();

    expect(container).toBeEmptyDOMElement();
  });
});

describe('TranscriptionSection: действия', () => {
  it('«Скачать .txt» вызывает скачивание с id встречи и именем файла', async () => {
    vi.mocked(api.getTranscription).mockResolvedValue(
      tr({ status: 'DONE', text: 'a' }),
    );
    vi.mocked(downloadTranscription).mockResolvedValue();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({ ...file, transcriptionStatus: 'DONE' });
    await flush();

    await user.click(screen.getByRole('button', { name: 'Скачать .txt' }));

    expect(downloadTranscription).toHaveBeenCalledWith(
      'm1',
      'Запись встречи.mp4',
    );
  });

  it('ошибка скачивания показывается на русском', async () => {
    vi.mocked(api.getTranscription).mockResolvedValue(
      tr({ status: 'DONE', text: 'a' }),
    );
    vi.mocked(downloadTranscription).mockRejectedValue(
      new ApiError('Не удалось скачать текст: соединение прервано', 0),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({ ...file, transcriptionStatus: 'DONE' });
    await flush();

    await user.click(screen.getByRole('button', { name: 'Скачать .txt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'соединение прервано',
    );
  });

  it('«Повторить» ставит задачу заново и возобновляет опрос до «Готово»', async () => {
    vi.mocked(api.getTranscription)
      .mockResolvedValueOnce(tr({ status: 'FAILED', error: 'Сбой' }))
      .mockResolvedValueOnce(tr({ status: 'QUEUED' }))
      .mockResolvedValue(tr({ status: 'DONE', text: 'Со второй попытки' }));
    vi.mocked(api.retryTranscription).mockResolvedValue(
      tr({ status: 'QUEUED' }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({ ...file, transcriptionStatus: 'FAILED' });
    await flush();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await flush();
    expect(api.retryTranscription).toHaveBeenCalledWith('m1');
    expect(screen.getByTestId('transcription-status')).toHaveTextContent(
      'В очереди',
    );

    await advance(POLL_INTERVAL_MS);

    expect(screen.getByTestId('transcription-status')).toHaveTextContent(
      'Готово',
    );
    expect(screen.getByTestId('transcription-text')).toHaveTextContent(
      'Со второй попытки',
    );
  });

  it('ошибка повтора (409) показывается, статус обновляется с сервера', async () => {
    vi.mocked(api.getTranscription)
      .mockResolvedValueOnce(tr({ status: 'FAILED', error: 'Сбой' }))
      .mockResolvedValue(tr({ status: 'DONE', text: 'Уже готово' }));
    vi.mocked(api.retryTranscription).mockRejectedValue(
      new ApiError(
        'Повторить можно только транскрибацию со статусом «Ошибка»',
        409,
      ),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({ ...file, transcriptionStatus: 'FAILED' });
    await flush();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Повторить можно только',
    );
    expect(screen.getByTestId('transcription-status')).toHaveTextContent(
      'Готово',
    );
  });
});
