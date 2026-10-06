# video-meetings

Монорепозиторий (pnpm workspaces):

| Пакет | Стек    | Путь       | Порт |
| ----- | ------- | ---------- | ---- |
| `web` | Next.js | `apps/web` | 3000 |
| `api` | NestJS  | `apps/api` | 3001 |

## Старт

```bash
pnpm install
pnpm dev          # web + api параллельно
```

## Скрипты (из корня)

- `pnpm dev` / `dev:web` / `dev:api` — режим разработки
- `pnpm build` / `build:web` / `build:api` — сборка
- `pnpm lint` — линтинг (ESLint в web, oxlint в api)
- `pnpm test` — тесты
- `pnpm typecheck` — проверка типов
- `pnpm format` / `format:check` — Prettier для всего репозитория
