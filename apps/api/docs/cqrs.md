# CQRS в API

Паттерн реализован через `@nestjs/cqrs` и сейчас применяется только в модуле `auth`. Модули `meetings` и `users` используют обычные сервисы — переводить их на CQRS не обязательно, но при росте логики можно по тому же образцу.

## Идея

- **Команда** (`Command`) — намерение изменить состояние. Возвращает результат операции (здесь — `AuthResult`), обрабатывается ровно одним обработчиком.
- **Запрос** (`Query`) — чтение, состояние не меняет. Тоже обрабатывается одним обработчиком.
- **Контроллер** ничего не решает: превращает DTO в сообщение и отправляет его в шину (`CommandBus` / `QueryBus`). Вся логика — в обработчике.
- Сообщение — простой класс с `public readonly` полями, без логики и зависимостей.

```
HTTP → Controller → CommandBus/QueryBus → Handler → UsersService / AuthTokenService → Prisma
```

## Что есть сейчас

| Операция    | Эндпоинт              | Сообщение             | Обработчик            |
| ----------- | --------------------- | --------------------- | --------------------- |
| Регистрация | `POST /auth/register` | `RegisterUserCommand` | `RegisterUserHandler` |
| Вход        | `POST /auth/login`    | `LoginQuery`          | `LoginHandler`        |

Файлы: `src/auth/commands/register-user.{command,handler}.ts`, `src/auth/queries/login.{query,handler}.ts`.

Вход — именно запрос, а не команда: он не меняет состояние (токен выдаётся без записи в БД). Поэтому `POST /auth/login` помечен `@HttpCode(200)`, а `POST /auth/register` отвечает 201.

## Как устроено

Сообщение:

```ts
export class LoginQuery {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}
```

Обработчик (`@CommandHandler` для команд, `@QueryHandler` для запросов; обработчик типизируется `ICommandHandler<Команда, Результат>` / `IQueryHandler<Запрос, Результат>`):

```ts
@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<LoginQuery, AuthResult> {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: AuthTokenService,
  ) {}

  async execute({ email, password }: LoginQuery): Promise<AuthResult> {
    /* ... */
  }
}
```

Контроллер (результат типизируется через generic `execute<Сообщение, Результат>`):

```ts
return this.queryBus.execute<LoginQuery, AuthResult>(
  new LoginQuery(dto.email, dto.password),
);
```

Модуль: импортирует `CqrsModule`, а каждый обработчик обязательно указан в `providers` (см. `auth.module.ts`). Незарегистрированный обработчик не будет найден шиной — запрос упадёт в рантайме с ошибкой «handler not found».

## Ошибки

Обработчик бросает HTTP-исключения Nest (`ConflictException`, `UnauthorizedException`) — они проходят через шину без изменений и превращаются в ответ. Так, `RegisterUserHandler` ловит ошибку Prisma `P2002` (нарушение уникальности email) и превращает её в 409. Сообщения — на русском.

## Как добавить новую операцию

1. Создайте `*.command.ts` (или `*.query.ts`) с классом сообщения и рядом `*.handler.ts` с обработчиком в `commands/` или `queries/` модуля.
2. Зарегистрируйте обработчик в `providers` модуля; убедитесь, что модуль импортирует `CqrsModule`.
3. В контроллере инжектируйте `CommandBus`/`QueryBus` и отправьте сообщение через `execute`.
4. Напишите e2e-тест эндпоинта (`test/*.e2e-spec.ts`); обработчики отдельно не мокаются — тесты идут через HTTP и реальную тестовую БД.

## Соглашения

- Запрос не должен менять состояние; всё, что пишет в БД, — команда.
- Не вызывайте одну команду/запрос из другого обработчика напрямую через шину без необходимости — выносите общую логику в сервис (как `AuthTokenService`, который используют оба обработчика).
- Бизнес-логику не кладите в контроллер, а HTTP-детали (DTO, `req`) — в обработчик.
