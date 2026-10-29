import { getJwtSecret } from './jwt-secret.js';

describe('getJwtSecret', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('вне production без JWT_SECRET берёт значение для разработки', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_SECRET', '');
    expect(getJwtSecret()).toBe('dev-secret-change-me');
  });

  it('в production без JWT_SECRET бросает ошибку', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');
    expect(() => getJwtSecret()).toThrow('JWT_SECRET');
  });

  it('в production короткий секрет отклоняется', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'short');
    expect(() => getJwtSecret()).toThrow('JWT_SECRET');
  });

  it('в production длинный секрет принимается', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'x'.repeat(32));
    expect(getJwtSecret()).toBe('x'.repeat(32));
  });
});
