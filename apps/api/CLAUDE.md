# apps/api — NestJS

Общие правила репозитория — в `../../CLAUDE.md`.

## Команды (из `apps/api` или `pnpm --filter api ...`)

- `dev` — запуск с watch на порту 3001 (`PORT` переопределяет)
- `build`, `start:prod`
- `lint` (oxlint с проверкой типов), `lint:fix`, `typecheck`
- `db:migrate` (создать миграцию в dev-БД), `db:deploy` (применить миграции), `db:generate` (сгенерировать Prisma Client; выполняется и в `postinstall`)
- `test` — unit (vitest, `src/**/*.spec.ts`; сейчас unit-тестов нет, прогон проходит без них — `passWithNoTests`); `test:e2e` — e2e (`test/*.e2e-spec.ts`)

## Структура и соглашения

- Пакет ESM (`"type": "module"`, `nodenext`): относительные импорты **обязательно с расширением `.js`**, например `'./app.module.js'`.
- Модули по доменам: `auth/`, `users/`, `meetings/`. Контроллер + сервис + DTO + модуль в одной папке. Корневого контроллера нет: `AppModule` только собирает модули (маршрута `GET /` не существует).
- DTO валидируются через `class-validator`; глобальный `ValidationPipe` и CORS подключаются в `src/setup-app.ts` (его же используют e2e-тесты, не дублируйте настройку в `main.ts`).
- Защищённые маршруты: `@UseGuards(JwtAuthGuard)`, текущий пользователь — `req.user` (`AuthRequest`).
- Модуль `auth` построен на CQRS (`@nestjs/cqrs`): контроллер только отправляет сообщения в `CommandBus`/`QueryBus`, вся логика — в обработчиках. Регистрация — команда `RegisterUserCommand` (`auth/commands/`), логин — запрос `LoginQuery` (`auth/queries/`, он не меняет состояние). Новые операции добавляйте как пару `*.command.ts`/`*.handler.ts` (или `*.query.ts`/`*.handler.ts`) и регистрируйте обработчик в `providers` модуля. Подробнее — в `docs/cqrs.md`.
- Пароли хешируются в `auth/password.ts` (scrypt), JWT выдаёт `AuthTokenService`.
- ORM — Prisma 7 (`prisma/schema.prisma`, конфиг `prisma.config.ts`, драйвер-адаптер `@prisma/adapter-pg`). Клиент генерируется в `src/generated/prisma` (в git не хранится); импортируйте из `../generated/prisma/client.js`. `PrismaService` (глобальный `PrismaModule`) — единственная точка доступа к БД.
- `UsersService` работает через Prisma; уникальность email обеспечивает БД (ошибка `P2002` превращается в 409 в `RegisterUserHandler` и в `UsersService.updateProfile`). Хеш пароля наружу не отдаётся — используйте `toProfile()` / `UserProfile`.
- Эндпоинты `users` (все под `JwtAuthGuard`, обычные контроллер+сервис без CQRS): `GET /users?search=` (поиск по части email/имени, до 20 записей), `GET /users/me`, `PATCH /users/me` (`name`, `email`; пустое имя сбрасывает), `PUT /users/me/password` (`currentPassword`, `newPassword`; 204), `DELETE /users/me` (`password` в теле; 204), `GET /users/:id` (UUID, иначе 400; 404 если нет). Тесты — `test/users.e2e-spec.ts`. JWT хранит email на момент входа, поэтому после смены email `/auth/me` отдаёт старое значение до повторного входа — актуальный профиль в `/users/me`.
- `MeetingsService` пока держит данные в памяти — при переходе на БД менять нужно только его.
- После изменения `schema.prisma` создайте миграцию: `pnpm --filter api db:migrate -- --name <имя>`.
- e2e-тесты работают с отдельной БД `video_meetings_test` (`test/test-database.ts`, `TEST_DATABASE_URL` переопределяет); `test/global-setup.ts` применяет к ней миграции, файлы идут последовательно, а таблицу `users` каждый тест очищает сам.
- Эндпоинты `meetings` (все под `JwtAuthGuard`): `POST /meetings` (`title` обязателен; `date` ISO 8601 и `participants` — массив строк необязательны), `GET /meetings`, `GET /meetings/:id` (404 для несуществующей и чужой встречи). Тесты — `test/meetings.e2e-spec.ts`.
- Сообщения об ошибках для пользователя — на русском.

## Окружение

- `DATABASE_URL` — строка подключения к Postgres (по умолчанию локальная БД из Docker Compose)
- `JWT_SECRET` — секрет токена (по умолчанию dev-значение, в проде обязательно задать)
- `WEB_ORIGIN` — разрешённый origin для CORS (по умолчанию `http://localhost:3000`)

## Перед завершением

`pnpm --filter api lint && pnpm --filter api typecheck && pnpm --filter api test && pnpm --filter api test:e2e`
