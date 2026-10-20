import { UnsupportedMediaTypeException } from '@nestjs/common';
import { imageSamples, samples } from '../../test/sample-files.js';
import { detectAvatarMime } from './avatar.validator.js';

describe('avatar.validator', () => {
  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)('определяет %s по содержимому', async (kind, mime) => {
    await expect(detectAvatarMime(imageSamples[kind]())).resolves.toBe(mime);
  });

  it('отклоняет исполняемый файл, выданный за картинку', async () => {
    await expect(detectAvatarMime(samples.exe())).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });

  it('отклоняет допустимый, но не подходящий формат (pdf)', async () => {
    await expect(detectAvatarMime(samples.pdf())).rejects.toThrow(
      /JPEG, PNG или WebP/,
    );
  });

  it('отклоняет неопознанное содержимое', async () => {
    await expect(
      detectAvatarMime(Buffer.from('просто текст')),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });
});
