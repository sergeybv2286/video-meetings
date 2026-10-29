# video-meetings

Монорепозиторий на pnpm workspaces (`pnpm@12.9.1`, Node >= 22, см. `.nvmrc`).

- `apps/web` — Next.js (App Router, Tailwind, HeroUI), порт 3000. См. `apps/web/CLAUDE.md`.
- `apps/api` — NestJS 12 (ESM), порт 3001. См. `apps/api/CLAUDE.md`.

## Первый запуск

`pnpm install` → `cp .env.example .env` (необязательно, есть значения по умолчанию) → `docker compose up -d` → `pnpm --filter api db:deploy` → `pnpm dev`.

## Команды

Все скрипты — в корневом `package.json` и `apps/*/package.json`; для одного пакета: `pnpm --filter <web|api> <script>`.

- `pnpm test` — только unit-тесты. E2E API: `pnpm --filter api test:e2e`, нужен Postgres (`docker compose up -d`), использует отдельную БД `video_meetings_test`.
- `docker compose up -d` — Postgres 17 (порт 5432, параметры `POSTGRES_*` в `.env`); `docker compose down -v` удаляет данные.
- Prisma (в `apps/api`): после правки `schema.prisma` — `pnpm --filter api db:migrate -- --name <имя>`; применить готовые миграции — `db:deploy`. Клиент генерируется в `postinstall` и в git не хранится.
- Переменные окружения — в `.env.example` и `apps/api/CLAUDE.md`.

## Соглашения

- Единый Prettier-конфиг в корне (`singleQuote`, `trailingComma: all`). Перед завершением работы запускайте `pnpm lint` и `pnpm typecheck`.
- Husky (`.husky/pre-commit`) на каждый коммит запускает `pnpm lint` и `pnpm test`; хуки ставятся скриптом `prepare` при `pnpm install`.
- Хук `PostToolUse` в `.claude/settings.json` запускает `prettier --write` на файле после `Write`/`Edit` (учитывает `.prettierignore`). Если файл изменился после правки, перечитайте его перед следующим `Edit`.
- Зависимости добавляйте в конкретный пакет: `pnpm --filter <web|api> add <pkg>`. В корне только общие dev-инструменты.
- Язык интерфейса и сообщений об ошибках — русский.
- Секреты и `.env*` не коммитим (кроме `.env.example`).
- Скиллы: исходники в `.agents/skills/` (список — `skills-lock.json`), Claude Code читает их из `.claude/skills/` через симлинки. Новый скилл: `ln -s ../../.agents/skills/<имя> .claude/skills/<имя>` и перезапуск сессии.
- MCP: `.mcp.json` (в git), подключён `playwright` для проверки веб-интерфейса; при первом запуске подтвердите сервер.

## Экономия токенов

- `git diff` всегда с `--unified=0`
- `git log` всегда с `--oneline -10`
- `gh issue list` всегда с `--json number,title`
- `pnpm test` всегда с `--silent`
- `pnpm typecheck` и `pnpm lint` всегда с `2>&1 | tail -20`
- Большие файлы читайте частями (`offset`/`limit`), а `apps/api/CLAUDE.md` и `apps/web/CLAUDE.md` — только нужным разделом.

## Документация

Меняя команды, env, структуру, страницы, эндпоинты, библиотеки или соглашения, обновляйте `CLAUDE.md` (корневой и в `apps/*`) и `README.md` в той же правке. Детали по модулям и эндпоинтам живут в `apps/*/CLAUDE.md`, в корень их не дублируйте. Устаревшее удаляйте.

## Текущее состояние

- Реализовано: регистрация и вход (JWT), встречи, профиль пользователя, аватар, файл встречи, транскрибация MP3/MP4 локальным Whisper (API и страница встречи). Данные пользователей и метаданные файлов — в Postgres (Prisma), сами файлы — на диске.
- Подробности по эндпоинтам и страницам — в `apps/api/CLAUDE.md` и `apps/web/CLAUDE.md`.

## Ловушки

- **Встречи хранятся в памяти API** и теряются при перезапуске. Поэтому при старте `MeetingFilesCleanupService` удаляет записи и файлы без встречи. При переносе встреч в БД эту очистку нужно пересмотреть, иначе она удалит все файлы.
