import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  getFfmpegCommand,
  getWhisperCommand,
  getWhisperModel,
  getWhisperModelDir,
} from './transcription.config.js';

const execFileAsync = promisify(execFile);

/** Вывод ffmpeg/Whisper может быть длинным; лишнее нас не интересует. */
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

/**
 * Превращает файл встречи в текст. Абстрактный класс служит DI-токеном:
 * в тестах вместо Whisper подставляется заглушка.
 */
export abstract class TranscriptionRunner {
  /**
   * `filePath` — абсолютный путь к файлу; возвращает распознанный текст.
   * При `signal.abort()` внешние процессы убиваются, а промис отклоняется.
   */
  abstract run(filePath: string, signal: AbortSignal): Promise<string>;
}

/** Ошибка с сообщением на русском, которое безопасно показать пользователю. */
export class TranscriptionError extends Error {}

type ExecError = NodeJS.ErrnoException & { stderr?: string };

async function exec(
  command: string,
  args: string[],
  signal: AbortSignal,
  tool: string,
  failure: string,
): Promise<void> {
  try {
    await execFileAsync(command, args, {
      maxBuffer: MAX_OUTPUT_BYTES,
      signal,
      killSignal: 'SIGKILL',
    });
  } catch (error) {
    // Отмену и таймаут разбирает очередь.
    if (signal.aborted) throw error;
    if ((error as ExecError).code === 'ENOENT') {
      throw new TranscriptionError(
        `${tool} недоступен на сервере. Обратитесь к администратору`,
        { cause: error },
      );
    }
    throw new TranscriptionError(failure, { cause: error });
  }
}

/** Локальный запуск ffmpeg и Whisper во внешних процессах: без блокировки Node и без сети. */
@Injectable()
export class WhisperTranscriptionRunner extends TranscriptionRunner {
  async run(filePath: string, signal: AbortSignal): Promise<string> {
    const workDir = await mkdtemp(path.join(os.tmpdir(), 'transcription-'));
    try {
      const audioPath = path.join(workDir, 'audio.wav');
      await exec(
        getFfmpegCommand(),
        [
          '-nostdin',
          '-nostats',
          '-loglevel',
          'error',
          '-y',
          '-i',
          filePath,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          audioPath,
        ],
        signal,
        'ffmpeg',
        'Не удалось прочитать звук: файл повреждён или имеет неподдерживаемый формат',
      );
      const modelDir = getWhisperModelDir();
      await exec(
        getWhisperCommand(),
        [
          audioPath,
          '--model',
          getWhisperModel(),
          '--output_format',
          'txt',
          '--output_dir',
          workDir,
          '--fp16',
          'False',
          '--verbose',
          'False',
          ...(modelDir ? ['--model_dir', modelDir] : []),
        ],
        signal,
        'Whisper',
        'Whisper не смог распознать речь в файле',
      );
      try {
        return (await readFile(path.join(workDir, 'audio.txt'), 'utf8')).trim();
      } catch (error) {
        throw new TranscriptionError('Whisper не вернул результат', {
          cause: error,
        });
      }
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
