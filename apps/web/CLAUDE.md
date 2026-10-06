@AGENTS.md

# apps/web — Next.js

Общие правила репозитория — в `../../CLAUDE.md`.

## Команды (из `apps/web` или `pnpm --filter web ...`)

- `dev` — порт 3000; `build`, `start`
- `lint` (ESLint + `eslint-config-prettier`), `lint:fix`
- `typecheck` — `tsc --noEmit`. Без предварительного `build`/`dev` может падать из-за отсутствия `.next/types`.

## Структура и соглашения

- App Router, исходники в `src/`, алиас `@/*` -> `src/*`.
- Страницы: `/` (защищена, список встреч), `/login`, `/register`.
- `src/lib/api.ts` — единственная точка обращения к API (`NEXT_PUBLIC_API_URL`, по умолчанию `http://localhost:3001`). Подставляет `Authorization: Bearer`, при 401 сбрасывает сессию.
- `src/lib/session.ts` — сессия (токен и email) в `localStorage` под ключом `vm.session`, хук `useSession()` через `useSyncExternalStore`. `loading: true`, пока клиент не прочитал хранилище.
- Защита страниц сейчас клиентская: при `!loading && !session` делается `router.replace('/login')`.
- Правила `react-hooks` строгие: не вызывайте `setState` синхронно в `useEffect`, не оборачивайте в `useCallback`/`useMemo` не инлайн-функции.
- Интерфейс на русском (`<html lang="ru">`), стили на Tailwind, тёмная тема через `prefers-color-scheme`.
- Переменные окружения описывайте в `.env.example`.
