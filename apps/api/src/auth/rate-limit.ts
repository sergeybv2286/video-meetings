const MINUTE_MS = 60_000;

/** Общий лимит запросов с одного IP в минуту (`RATE_LIMIT`, по умолчанию 300). */
export const DEFAULT_THROTTLE = {
  ttl: MINUTE_MS,
  limit: Number(process.env.RATE_LIMIT) || 300,
};

/** Строгий лимит для входа, регистрации, смены и проверки пароля (`AUTH_RATE_LIMIT`, по умолчанию 10 в минуту). */
export const AUTH_THROTTLE = {
  default: {
    ttl: MINUTE_MS,
    limit: Number(process.env.AUTH_RATE_LIMIT) || 10,
  },
};
