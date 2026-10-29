const DEV_SECRET = 'dev-secret-change-me';
const MIN_SECRET_LENGTH = 32;

/** Секрет подписи JWT. В production обязателен и не короче 32 символов; в dev/test есть значение по умолчанию. */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET обязателен в production и должен быть не короче ${MIN_SECRET_LENGTH} символов`,
      );
    }
    return secret;
  }
  return secret || DEV_SECRET;
}
