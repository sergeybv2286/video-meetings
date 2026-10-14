// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileSection } from './file-section';
import {
  api,
  ApiError,
  downloadMeetingFile,
  type MeetingFile,
} from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...original,
    downloadMeetingFile: vi.fn(),
    uploadMeetingFile: vi.fn(),
    api: {
      ...original.api,
      deleteMeetingFile: vi.fn(),
      getMeetingFile: vi.fn(),
    },
  };
});

const file: MeetingFile = {
  id: 'f1',
  meetingId: 'm1',
  originalName: 'Запись встречи.mp4',
  mimeType: 'video/mp4',
  size: 1536 * 1024,
  status: 'UPLOADED',
  uploadedAt: '2026-10-14T10:00:00.000Z',
};

function setup() {
  const onReplaced = vi.fn();
  const onDeleted = vi.fn();
  const user = userEvent.setup();
  render(
    <FileSection file={file} onReplaced={onReplaced} onDeleted={onDeleted} />,
  );
  return { user, onReplaced, onDeleted };
}

afterEach(cleanup);

describe('FileSection: карточка', () => {
  it('показывает имя, тип, размер, дату и статус «Загружен»', () => {
    setup();

    expect(screen.getByTestId('file-name')).toHaveTextContent(
      'Запись встречи.mp4',
    );
    expect(screen.getByTestId('file-type')).toHaveTextContent('Видео MP4');
    expect(screen.getByTestId('file-size')).toHaveTextContent('1,5 МБ');
    expect(screen.getByTestId('file-status')).toHaveTextContent('Загружен');
  });
});

describe('FileSection: скачивание', () => {
  it('«Скачать» вызывает скачивание с id встречи и исходным именем', async () => {
    vi.mocked(downloadMeetingFile).mockResolvedValue();
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    expect(downloadMeetingFile).toHaveBeenCalledWith(
      'm1',
      'Запись встречи.mp4',
    );
  });

  it('ошибка скачивания показывается по-русски', async () => {
    vi.mocked(downloadMeetingFile).mockRejectedValue(
      new ApiError('Файл не найден', 404),
    );
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Файл не найден',
    );
  });
});

describe('FileSection: замена', () => {
  it('«Заменить файл» открывает зону загрузки, «Отмена» закрывает её', async () => {
    const { user } = setup();
    expect(screen.queryByTestId('dropzone')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Заменить файл' }));
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Заменить файл' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByTestId('dropzone')).toBeNull();
    // карточка со старым файлом на месте
    expect(screen.getByTestId('file-name')).toHaveTextContent(
      'Запись встречи.mp4',
    );
  });
});

describe('FileSection: удаление', () => {
  const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      screen.getByTestId('file-card').querySelector('button:last-of-type')!,
    );
    return screen.findByRole('alertdialog');
  };

  it('без подтверждения файл не удаляется: «Удалить» только открывает диалог', async () => {
    const { user, onDeleted } = setup();

    const dialog = await openDialog(user);

    expect(dialog).toHaveTextContent('Удалить файл?');
    expect(dialog).toHaveTextContent('Запись встречи.mp4');
    expect(api.deleteMeetingFile).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('«Отмена» закрывает диалог, файл не удаляется', async () => {
    const { user, onDeleted } = setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.deleteMeetingFile).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('подтверждение удаляет файл и сообщает родителю', async () => {
    vi.mocked(api.deleteMeetingFile).mockResolvedValue(undefined);
    const { user, onDeleted } = setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(api.deleteMeetingFile).toHaveBeenCalledWith('m1');
  });

  it('404 (файл уже удалён) считается успехом', async () => {
    vi.mocked(api.deleteMeetingFile).mockRejectedValue(
      new ApiError('Файл не найден', 404),
    );
    const { user, onDeleted } = setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('другая ошибка: диалог остаётся, ошибка видна, родитель не уведомлён', async () => {
    vi.mocked(api.deleteMeetingFile).mockRejectedValue(
      new ApiError('Не удалось связаться с сервером', 0),
    );
    const { user, onDeleted } = setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Не удалось связаться с сервером',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
