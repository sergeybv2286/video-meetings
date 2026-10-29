import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('принимает верный пароль и отклоняет неверный', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
    expect(await verifyPassword('secret124', hash)).toBe(false);
  });

  it('соль у каждого хеша своя', async () => {
    expect(await hashPassword('secret123')).not.toBe(
      await hashPassword('secret123'),
    );
  });

  it.each(['', 'без-двоеточия', 'salt:', ':hash'])(
    'повреждённый хеш %j не проходит и не бросает ошибку',
    async (stored) => {
      expect(await verifyPassword('secret123', stored)).toBe(false);
    },
  );

  it('хеш-пустышка никогда не совпадает', async () => {
    expect(await verifyPassword('secret123', DUMMY_HASH)).toBe(false);
    expect(await verifyPassword('', DUMMY_HASH)).toBe(false);
  });
});
