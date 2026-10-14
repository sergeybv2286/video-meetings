# video-meetings

Монорепозиторий (pnpm workspaces):

| Пакет | Стек            | Путь       | Порт |
| ----- | --------------- | ---------- | ---- |
| `web` | Next.js, HeroUI | `apps/web` | 3000 |
| `api` | NestJS          | `apps/api` | 3001 |

## Старт

```bash
pnpm install
docker compose up -d   # Postgres на порту 5432
pnpm dev               # web + api параллельно
```

## База данных

Postgres 17 поднимается через `docker-compose.yml` (контейнер `video-meetings-postgres`, том `postgres_data`).
Параметры по умолчанию: пользователь, пароль и база `video_meetings`, порт `5432`; переопределяются через `.env` в корне (см. `.env.example`).

- `docker compose up -d` — запустить, `docker compose down` — остановить (данные сохраняются), `docker compose down -v` — остановить и удалить данные
- Строка подключения: `postgresql://video_meetings:video_meetings@localhost:5432/video_meetings`

API работает с БД через Prisma (`apps/api/prisma/schema.prisma`): пользователи хранятся в Postgres. Встречи пока хранятся в памяти API.

- `pnpm --filter api db:migrate` — создать и применить миграцию в dev-БД (после изменения схемы)
- `pnpm --filter api db:deploy` — применить существующие миграции
- Prisma Client генерируется в `apps/api/src/generated` (в git не хранится) автоматически при `pnpm install`; вручную — `pnpm --filter api db:generate`
- Строка подключения — `DATABASE_URL` (по умолчанию как выше)
- e2e-тесты используют отдельную БД `video_meetings_test` (создаётся и мигрируется автоматически, нужен запущенный Postgres)

## Тесты

| Команда                        | Что запускает                                                   | Нужен Postgres |
| ------------------------------ | --------------------------------------------------------------- | -------------- |
| `pnpm test`                    | unit-тесты пакетов (`apps/api/src/**/*.spec.ts`; сейчас их нет) | нет            |
| `pnpm --filter api test:e2e`   | e2e API (`apps/api/test/*.e2e-spec.ts`: auth, users, meetings)  | да             |
| `pnpm --filter api test:watch` | unit-тесты API в watch-режиме                                   | нет            |
| `pnpm --filter api test:cov`   | unit-тесты API с покрытием                                      | нет            |

Для e2e сначала запустите Postgres: `docker compose up -d`. Тесты работают с отдельной БД `video_meetings_test` (адрес переопределяется через `TEST_DATABASE_URL`): перед прогоном `test/global-setup.ts` применяет к ней миграции, файлы идут последовательно, а таблицу `users` каждый тест очищает сам, dev-данные не затрагиваются. Один файл: `pnpm --filter api test:e2e -- test/users.e2e-spec.ts`.

Перед завершением работы прогоните всё: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter api test:e2e`.

## Скрипты (из корня)

- `pnpm dev` / `dev:web` / `dev:api` — режим разработки
- `pnpm build` / `build:web` / `build:api` — сборка
- `pnpm lint` — линтинг (ESLint в web, oxlint в api)
- `pnpm test` — unit-тесты всех пакетов (e2e API запускаются отдельно, см. «Тесты»)
- `pnpm typecheck` — проверка типов
- `pnpm format` / `format:check` — Prettier для всего репозитория
- Git-хук `pre-commit` (Husky, `.husky/pre-commit`) перед каждым коммитом запускает `pnpm lint` и `pnpm test`; устанавливается автоматически через `prepare` при `pnpm install`. Обойти в крайнем случае: `git commit --no-verify`
