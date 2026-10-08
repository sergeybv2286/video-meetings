/** Отдельная БД для e2e, чтобы тесты не затрагивали dev-данные. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://video_meetings:video_meetings@localhost:5432/video_meetings_test';
