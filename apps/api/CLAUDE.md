# apps/api — NestJS

Общие правила репозитория — в `../../CLAUDE.md`.

## Команды (из `apps/api` или `pnpm --filter api ...`)

- `dev` — запуск с watch на порту 3001 (`PORT` переопределяет)
- `build`, `start:prod`
- `lint` (oxlint с проверкой типов), `lint:fix`, `typecheck`
- `db:migrate` (создать миграцию в dev-БД), `db:deploy` (применить миграции), `db:generate` (сгенерировать Prisma Client; выполняется и в `postinstall`)
- `test` — unit (vitest, `src/**/*.spec.ts`; `passWithNoTests`); `test:e2e` — e2e (`test/*.e2e-spec.ts`)

## Структура и соглашения

- Пакет ESM (`"type": "module"`, `nodenext`): относительные импорты **обязательно с расширением `.js`**, например `'./app.module.js'`.
- Модули по доменам: `auth/`, `users/`, `meetings/`, `meeting-files/`. Контроллер + сервис + DTO + модуль в одной папке. Корневого контроллера нет: `AppModule` только собирает модули (маршрута `GET /` не существует).
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
- Файл встречи (`meeting-files/`, обычные контроллер+сервис, без CQRS): `POST /meetings/:id/file` (multipart, поле `file`; 201 + метаданные, 409 если файл уже есть, 400 без файла) `GET /meetings/:id/file` (метаданные: `id`, `meetingId`, `originalName`, `mimeType`, `size`, `status` = `UPLOADED`, `uploadedAt`; 404 если файла нет), `GET /meetings/:id/file/download` (потоковая отдача: `Content-Type` из БД, `Content-Length`, `Content-Disposition: attachment` с `filename` (ASCII-запас) и `filename*` (UTF-8) из `content-disposition.ts`, `X-Content-Type-Options: nosniff`; 404, если записи нет или файл пропал с диска), `PUT /meetings/:id/file` (замена, те же multipart-поле и валидация, что у `POST`; 200 + метаданные с прежним `id`; если файла не было — ведёт себя как `POST`; сначала обновляются метаданные, затем удаляется старый файл с диска, при ошибке новый файл удаляется, а старый и его метаданные не меняются) и `DELETE /meetings/:id/file` (204; удаляет запись и файл с диска; 404, если файла нет; сбой удаления с диска только логируется). Порядок: `JwtAuthGuard` → `MeetingOwnerGuard` (404 для чужой/несуществующей встречи до чтения тела) → для `POST` `MeetingFileAbsentGuard` (409, если файл уже есть, до чтения тела) → `FileInterceptor` с собственным `MeetingFileStorage` (поток в `<FILES_STORAGE_DIR>/tmp/<uuid>`, затем атомарный `rename` в `files/<uuid>`; имя на диске генерирует сервер, исходное имя — только в БД). В БД (`MeetingFile`, таблица `meeting_files`) хранится относительный `storageKey`, наружу он не отдаётся. `meetingId` без FK, т.к. встречи в памяти. Валидация (фаза 2): допустимы mp4, mov, webm, mp3, m4a, wav, pdf, docx, pptx, txt, vtt, srt (таблица `ALLOWED_TYPES` в `meeting-file.types.ts`); расширение неизвестно → 415 до записи на диск. Тип проверяется по содержимому в `meeting-file.validator.ts` (`file-type`; для docx/pptx дополнительно ищется `word/document.xml`/`ppt/presentation.xml` в центральном каталоге zip; текст — без NUL-байтов, кроме UTF-16 с BOM): этап 1 — по первым 4100 байтам прямо в потоке (неопределённый результат не отклоняет, решает этап 2; отклоняется только заведомо другой тип), этап 2 — по готовому tmp-файлу до `rename`; несовпадение с расширением → 415. В БД пишется MIME, определённый сервером (клиентский игнорируется), и очищенное имя (`sanitizeFileName`: без путей и управляющих символов, ≤255). Лимит 500 МБ (`MEETING_FILE_MAX_SIZE` в байтах переопределяет, нужно для тестов): `MeetingFileSizeGuard` (и для `POST`, и для `PUT`) по `Content-Length` до чтения тела, счётчик в `MeetingFileStorage` и `limits.fileSize` multer → 413; пустой файл → 400. При любой ошибке/обрыве tmp-файл удаляется (после закрытия потока записи, иначе незавершённое открытие создаст файл уже после `rm`), запись в БД не создаётся. Запись в storage сделана вручную (не `pipeline`) и читает поток через `iterator({ destroyOnReturn: false })`: иначе multer принимает AbortError вместо нашей ошибки. `MeetingFileUploadFilter` переводит английские сообщения multer на русский. `requestTimeout` HTTP-сервера — 30 минут (`server-config.ts`, только в `main.ts`). Признак «есть файл» в списке встреч и очистка сирот — фаза 4 в `docs/plan-meeting-file-upload.md`. Тесты — `src/meeting-files/*.spec.ts` и `test/meeting-files.e2e-spec.ts`; образцы файлов собираются в коде (`test/sample-files.ts`) (хранилище e2e — временная папка, `test/test-storage.ts`).
- Сообщения об ошибках для пользователя — на русском.

## Окружение

- `DATABASE_URL` — строка подключения к Postgres (по умолчанию локальная БД из Docker Compose)
- `JWT_SECRET` — секрет токена (по умолчанию dev-значение, в проде обязательно задать)
- `FILES_STORAGE_DIR` — каталог файлов встреч (по умолчанию `./storage` относительно `apps/api`, в `.gitignore`)
- `MEETING_FILE_MAX_SIZE` — лимит размера файла встречи в байтах (по умолчанию 524288000 = 500 МБ, максимум 2147483647 — колонка `size` типа Int)
- `WEB_ORIGIN` — разрешённый origin для CORS (по умолчанию `http://localhost:3000`)

## Перед завершением

`pnpm --filter api lint && pnpm --filter api typecheck && pnpm --filter api test && pnpm --filter api test:e2e`

## File Upload

Use this research for it: @docs/research-meeting-file-upload.md
