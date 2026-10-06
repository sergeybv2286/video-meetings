# apps/api — NestJS

Общие правила репозитория — в `../../CLAUDE.md`.

## Команды (из `apps/api` или `pnpm --filter api ...`)

- `dev` — запуск с watch на порту 3001 (`PORT` переопределяет)
- `build`, `start:prod`
- `lint` (oxlint с проверкой типов), `lint:fix`, `typecheck`
- `test` — unit (vitest, `src/**/*.spec.ts`); `test:e2e` — e2e (`test/*.e2e-spec.ts`)

## Структура и соглашения

- Пакет ESM (`"type": "module"`, `nodenext`): относительные импорты **обязательно с расширением `.js`**, например `'./app.module.js'`.
- Модули по доменам: `auth/`, `users/`, `meetings/`. Контроллер + сервис + DTO + модуль в одной папке.
- DTO валидируются через `class-validator`; глобальный `ValidationPipe` и CORS подключаются в `src/setup-app.ts` (его же используют e2e-тесты, не дублируйте настройку в `main.ts`).
- Защищённые маршруты: `@UseGuards(JwtAuthGuard)`, текущий пользователь — `req.user` (`AuthRequest`).
- Пароли хешируются в `auth/password.ts` (scrypt), JWT выдаёт `AuthService`.
- Хранилища (`UsersService`, `MeetingsService`) пока держат данные в памяти. При переходе на БД менять нужно только их.
- Сообщения об ошибках для пользователя — на русском.

## Окружение

- `JWT_SECRET` — секрет токена (по умолчанию dev-значение, в проде обязательно задать)
- `WEB_ORIGIN` — разрешённый origin для CORS (по умолчанию `http://localhost:3000`)

## Перед завершением

`pnpm --filter api lint && pnpm --filter api typecheck && pnpm --filter api test && pnpm --filter api test:e2e`
