import { TranscriptionRunner } from './../src/meeting-files/transcription/transcription-runner.js';

/** Подменяет Whisper в e2e: запоминает вызовы, считает одновременные задачи и слушает отмену. */
export class FakeTranscriptionRunner extends TranscriptionRunner {
  readonly calls: string[] = [];
  aborted = 0;
  maxActive = 0;
  text = 'Распознанный текст';
  error: Error | null = null;
  delayMs = 20;
  private active = 0;

  async run(filePath: string, signal: AbortSignal): Promise<string> {
    this.calls.push(filePath);
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          this.aborted++;
          reject(new Error('Процесс убит'));
        });
      });
      if (this.error) throw this.error;
      return this.text;
    } finally {
      this.active--;
    }
  }
}
