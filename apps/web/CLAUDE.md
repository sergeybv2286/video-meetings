@AGENTS.md

# apps/web — Next.js

Общие правила репозитория — в `../../CLAUDE.md`.

## Команды (из `apps/web` или `pnpm --filter web ...`)

- `dev` — порт 3000; `build`, `start`
- `lint` (ESLint + `eslint-config-prettier`), `lint:fix`
- `test` — unit-тесты (vitest, `src/**/*.test.{ts,tsx}`, конфиг `vitest.config.mts`, `setupFiles` подключает `@testing-library/jest-dom`); `test:watch`. Тесты с DOM помечаются первой строкой `// @vitest-environment jsdom` (компоненты — `@testing-library/react` и `user-event`, `lib/api` мокается через `vi.mock('@/lib/api', …)`); чистая логика идёт в node.
- `typecheck` — `tsc --noEmit`. Без предварительного `build`/`dev` может падать из-за отсутствия `.next/types`.

## Структура и соглашения

- App Router, исходники в `src/`, алиас `@/*` -> `src/*`.
- Страницы: `/` (защищена, создание встречи и единый список «Ваши встречи»; встречи — ссылки на `/meetings/<id>`), `/meetings/[id]` (защищена; заголовок и дата встречи, затем либо зона загрузки `FileUpload`, либо карточка файла `FileCard`; 404 от API — «Встреча не найдена»), `/login`, `/register`.
- Файл встречи: `src/lib/meeting-file.ts` — клиентская проверка (допустимые расширения и лимит 500 МБ должны совпадать с серверными в `apps/api/src/meeting-files/meeting-file.types.ts`; сообщения на русском; при ошибке загрузка не начинается), `formatFileSize`, `fileTypeLabel`. Компоненты: `file-upload.tsx` — зона загрузки (кнопка «Выбрать файл» со скрытым `<input type=file accept>`, drag-and-drop, прогресс, «Отменить», ошибка с «Повторить загрузку»; props `method` `POST`/`PUT`, `heading`, `onCancel`; после обрыва сети или 409 перепроверяет файл на сервере и показывает карточку, если он сохранился); `file-card.tsx` — карточка (имя, тип, размер, дата, статус «Загружен», слот `actions`); `file-section.tsx` — карточка с действиями: «Скачать», «Заменить файл» (открывает `FileUpload` с `PUT`; при сбое старая карточка и файл не меняются), «Удалить» (`AlertDialog` с подтверждением: Escape/«Отмена» закрывают, пока идёт удаление диалог заблокирован, ошибка видна в диалоге, 404 при удалении считается успехом). Страница встречи после удаления показывает `FileUpload`. В списке встреч у встреч с файлом метка «Есть файл» (`hasFile` из API). API-слой (`lib/api.ts`): загрузка и замена — `uploadMeetingFile` на XMLHttpRequest (только он даёт прогресс отправки; CORS разрешает origin из `WEB_ORIGIN`), скачивание — `downloadMeetingFile` (fetch с JWT → blob → ссылка `download`; имя берётся из метаданных, поэтому `Content-Disposition` в CORS не нужен; файл целиком держится в памяти браузера), удаление — `api.deleteMeetingFile` (204 без тела).
- `src/components/theme-toggle.tsx` — кнопка переключения темы (фиксирована в правом верхнем углу, подключена в `layout.tsx`).
- `src/components/app-title.tsx` — градиентный заголовок «Video Meetings» (на главной и в форме входа/регистрации).
- `src/lib/api.ts` — единственная точка обращения к API (`NEXT_PUBLIC_API_URL`, по умолчанию `http://localhost:3001`). Подставляет `Authorization: Bearer`, при 401 сбрасывает сессию.
- `src/lib/session.ts` — сессия (токен и email) в `localStorage` под ключом `vm.session`, хук `useSession()` через `useSyncExternalStore`. `loading: true`, пока клиент не прочитал хранилище.
- Защита страниц сейчас клиентская: при `!loading && !session` делается `router.replace('/login')`.
- Правила `react-hooks` строгие: не вызывайте `setState` синхронно в `useEffect`, не оборачивайте в `useCallback`/`useMemo` не инлайн-функции.
- Интерфейс на русском (`<html lang="ru">`), стили на Tailwind v4 и HeroUI v3 (`@heroui/react`, `@heroui/styles`, подключены в `src/app/globals.css` после `tailwindcss`). Провайдер не нужен, компоненты составные (`Card.Header`), вместо `onClick` — `onPress`. Цвета берите из токенов HeroUI (`bg-background`, `text-foreground`, `text-danger`). Тёмная тема HeroUI включается классом `dark` на `<html>`: inline-скрипт в `layout.tsx` ставит её до гидратации (выбор из `localStorage` `vm.theme` или `prefers-color-scheme`), переключает `src/components/theme-toggle.tsx`.
- UI-правила: на всех страницах только компоненты HeroUI; у полей видимый `Label`; интерактивные элементы не ниже 44px (`min-h-11`); вторичный текст — `text-muted` (не `opacity-*`); при загрузке — `Skeleton`, при отправке — `isPending`; анимации отключаются при `prefers-reduced-motion` (`globals.css`).
- **При любом изменении UI обязательно проверяйте результат визуально и по скиллу `ui-ux-pro-max`.** Запустите приложение (`pnpm dev`), откройте затронутые страницы через MCP `playwright` (скриншоты, светлая и тёмная темы, мобильная ширина, клавиатурная навигация и состояния: загрузка, ошибка, пусто) и убедитесь, что изменения работают как задумано. Затем сверьте UI с правилами скилла `ui-ux-pro-max` (доступность, касания, контраст, формы, адаптивность, анимации — см. `.claude/skills/ui-ux-pro-max/references/`) и исправьте найденные замечания до завершения задачи. Проверка только по коду без просмотра в браузере недостаточна.
- Переменные окружения описывайте в `.env.example`.
