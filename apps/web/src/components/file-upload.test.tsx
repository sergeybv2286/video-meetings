// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileUpload } from './file-upload';
import { api, ApiError, uploadMeetingFile, type MeetingFile } from '@/lib/api';
import { MAX_FILE_SIZE } from '@/lib/meeting-file';

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...original,
    uploadMeetingFile: vi.fn(),
    api: { ...original.api, getMeetingFile: vi.fn() },
  };
});

const uploaded: MeetingFile = {
  id: 'f1',
  meetingId: 'm1',
  originalName: 'subs.vtt',
  mimeType: 'text/vtt',
  size: 10,
  status: 'UPLOADED',
  uploadedAt: '2026-10-14T10:00:00.000Z',
};

function setup(props: Partial<Parameters<typeof FileUpload>[0]> = {}) {
  const onUploaded = vi.fn();
  render(<FileUpload meetingId="m1" onUploaded={onUploaded} {...props} />);
  const input = screen.getByTestId('file-input') as HTMLInputElement;
  const choose = (...files: File[]) =>
    userEvent.upload(input, files, { applyAccept: false });
  return { onUploaded, input, choose };
}

const vtt = () => new File(['WEBVTT'], 'subs.vtt', { type: 'text/vtt' });

afterEach(cleanup);

describe('FileUpload: подсказка', () => {
  it('показывает лимит и допустимые форматы', () => {
    setup();

    expect(screen.getByText(/Не больше 500 МБ/)).toBeInTheDocument();
    for (const ext of ['mp4', 'mp3', 'txt', 'pdf']) {
      expect(screen.getByText(new RegExp(ext))).toBeInTheDocument();
    }
  });

  it('поле выбора файла ограничено допустимыми расширениями', () => {
    const { input } = setup();

    expect(input.accept).toContain('.mp4');
    expect(input.accept).not.toContain('.exe');
  });
});

describe('FileUpload: клиентская проверка', () => {
  it('недопустимый тип: русская ошибка, запрос не отправляется', async () => {
    const { choose, onUploaded } = setup();

    await choose(new File(['MZ'], 'virus.exe'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /virus\.exe: Формат не поддерживается/,
    );
    expect(uploadMeetingFile).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
    // повторять нечего: файл заведомо недопустим
    expect(screen.queryByRole('button', { name: /Повторить/ })).toBeNull();
  });

  it('слишком большой файл: ошибка с лимитом, запрос не отправляется', async () => {
    const { choose } = setup();
    const big = new File(['x'], 'big.mp4');
    Object.defineProperty(big, 'size', { value: MAX_FILE_SIZE + 1 });

    await choose(big);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Максимальный размер — 500 МБ',
    );
    expect(uploadMeetingFile).not.toHaveBeenCalled();
  });

  it('drop нескольких файлов: ошибка, запрос не отправляется', async () => {
    setup();

    // Через диалог выбрать несколько файлов нельзя (нет `multiple`), но перетащить можно.
    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: { files: [vtt(), new File(['x'], 'b.vtt')] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Можно загрузить только один файл',
    );
    expect(uploadMeetingFile).not.toHaveBeenCalled();
  });
});

describe('FileUpload: загрузка', () => {
  it('успех: вызывает загрузку (POST по умолчанию) и сообщает родителю', async () => {
    vi.mocked(uploadMeetingFile).mockResolvedValue(uploaded);
    const { choose, onUploaded } = setup();

    await choose(vtt());

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(uploaded));
    const [meetingId, file, , , method] =
      vi.mocked(uploadMeetingFile).mock.calls[0];
    expect(meetingId).toBe('m1');
    expect(file.name).toBe('subs.vtt');
    expect(method).toBe('POST');
  });

  it('режим замены использует PUT и свой заголовок', async () => {
    vi.mocked(uploadMeetingFile).mockResolvedValue(uploaded);
    const { choose } = setup({ method: 'PUT', heading: 'Заменить файл' });

    expect(
      screen.getByRole('heading', { name: 'Заменить файл' }),
    ).toBeInTheDocument();
    await choose(vtt());

    await waitFor(() => expect(uploadMeetingFile).toHaveBeenCalled());
    expect(vi.mocked(uploadMeetingFile).mock.calls[0][4]).toBe('PUT');
  });

  it('во время загрузки показывает прогресс и «Отменить»', async () => {
    vi.mocked(uploadMeetingFile).mockImplementation(
      (_id, _file, onProgress) => {
        onProgress(40);
        return new Promise(() => undefined);
      },
    );
    const { choose } = setup();

    await choose(vtt());

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(
      screen.getByRole('button', { name: 'Отменить' }),
    ).toBeInTheDocument();
  });

  it('ошибка сервера: сообщение и «Повторить загрузку», повтор отправляет тот же файл', async () => {
    vi.mocked(uploadMeetingFile)
      .mockRejectedValueOnce(new ApiError('Сервер недоступен', 500))
      .mockResolvedValueOnce(uploaded);
    const { choose, onUploaded } = setup();

    await choose(vtt());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервер недоступен',
    );
    expect(onUploaded).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: /Повторить загрузку/ }),
    );

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(uploaded));
    expect(vi.mocked(uploadMeetingFile).mock.calls[1][1].name).toBe('subs.vtt');
  });

  it('обрыв сети, но сервер файл сохранил: показывает карточку вместо ошибки', async () => {
    vi.mocked(uploadMeetingFile).mockRejectedValue(
      new ApiError('Не удалось связаться с сервером', 0),
    );
    vi.mocked(api.getMeetingFile).mockResolvedValue(uploaded);
    const { choose, onUploaded } = setup();

    await choose(vtt());

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(uploaded));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('обрыв сети и файла на сервере нет: обычная ошибка с повтором', async () => {
    vi.mocked(uploadMeetingFile).mockRejectedValue(
      new ApiError('Не удалось связаться с сервером', 0),
    );
    vi.mocked(api.getMeetingFile).mockResolvedValue(null);
    const { choose, onUploaded } = setup();

    await choose(vtt());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось связаться с сервером',
    );
    expect(onUploaded).not.toHaveBeenCalled();
  });
});

describe('FileUpload: drag-and-drop и отмена', () => {
  it('drop одного файла запускает загрузку', async () => {
    vi.mocked(uploadMeetingFile).mockResolvedValue(uploaded);
    const { onUploaded } = setup();

    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: { files: [vtt()] },
    });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(uploaded));
  });

  it('подсветка зоны включается на dragover и гаснет на dragleave', () => {
    setup();
    const zone = screen.getByTestId('dropzone');

    fireEvent.dragOver(zone);
    expect(zone.className).toContain('border-accent');

    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain('border-accent');
  });

  it('«Отмена» вызывает onCancel', async () => {
    const onCancel = vi.fn();
    setup({ onCancel });

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('без onCancel кнопки «Отмена» нет', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Отмена' })).toBeNull();
  });
});
