# Patterns

Patterns that worked in WealthMesh v3, with the reason for each. Paths are relative to the repo root.

## Backend

### Layering per feature

```text
household/
  domain/       Household, HouseholdMember          records mapped to tables
  dto/          *Request, *Response                 the only types the API exposes
  mapper/       MapStruct interfaces                entity <-> DTO, normalisation, timestamps
  repository/   ReactiveCrudRepository interfaces
  service/      rules: validation, 404/409 mapping
  HouseholdController.java                          thin: routes to the service
```

Why: controllers never see entities, services never see HTTP request types beyond the DTO, and the wire format
can change without touching the schema.

### Entities as records

`@Table("household_member") record HouseholdMember(@Id UUID id, ...)`. The database generates the id
(`DEFAULT gen_random_uuid()`), so a null id means insert. Timestamps are set by the mapper, because Spring Data
would otherwise insert explicit NULLs into NOT NULL columns.

### Mappers (MapStruct) with records

Records cannot use `@MappingTarget`, so an update builds a new record from two sources:

```java
@Mapping(target = "id", source = "existing.id")
@Mapping(target = "name", source = "request.name", qualifiedByName = "strip")
@Mapping(target = "updatedAt", expression = "java(java.time.Instant.now())")
HouseholdMember toUpdatedEntity(HouseholdMemberRequest request, HouseholdMember existing);
```

Prefix every source with its parameter name; otherwise same-named properties are ambiguous. Put normalisation
(`strip`, `key`) in `@Named` default methods on the mapper.

### Errors

Services return `Mono.error(new ResponseStatusException(status, message))`:

- Validation failure: 400 with a user-readable message.
- `DataIntegrityViolationException` (unique constraint, FK): mapped to 409 with `onErrorMap`.
- Not found: 404 from `switchIfEmpty`.

Set `spring.web.error.include-message: always` so the message reaches the body. The client reads
`{ status, error, message }`.

### Singleton aggregate

Enforce "only one" in the database (`singleton BOOLEAN DEFAULT TRUE CHECK (singleton) UNIQUE`), expose it without
an id (`GET/POST/PUT /api/v1/household`), and translate the violation to 409 in the service.

### R2DBC and Flyway together

R2DBC serves requests; Flyway needs JDBC. With an R2DBC `ConnectionFactory` present, Boot creates no `DataSource`,
so give Flyway its own `spring.flyway.url/user/password`. Set the search path through the R2DBC `options`
property. Qualify table names with the schema in migrations.

### SPA fallback and fat jar

- `SpaFallbackFilter` rewrites GET/HEAD requests for page addresses to `/index.html`. It skips `/api`,
  `/actuator` and anything whose last segment contains a dot (so a missing asset is a real 404).
- `bootJar { from(frontend/dist) { into 'BOOT-INF/classes/static' } }`, depending on a `frontendBuild` Exec task
  with declared inputs and outputs so it is up to date when nothing changed.

## Frontend

### Design tokens in CSS, not config

Tailwind 4 has no `tailwind.config.js`. Semantic values are CSS variables (`--surface`, `--ink`, `--primary`,
light on `:root`, dark under `.dark`) mapped with `@theme inline` so utilities like `bg-surface` exist. Dark mode
needs `@custom-variant dark (&:where(.dark, .dark *));`.

### Component variants with `cva`

```tsx
const button = cva('inline-flex ...', {
  variants: { variant: { primary: '...', secondary: '...' }, size: { sm: '...', md: '...' } },
  defaultVariants: { variant: 'primary', size: 'md' },
})
```

`cn()` (`clsx` + `tailwind-merge`) lets callers override classes safely. React 19 passes `ref` as a normal prop, so
components spread `...props` onto the element and need no `forwardRef`.

### Forms: react-hook-form behind one reusable input

`TextField<T>` wraps `useController` and the design-system `Field`, so a screen only declares the rule:

```tsx
<TextField control={control} name="name" label="Member name" rules={{ required: 'Enter a member name.' }} />
```

Client-side rules show under the input; server failures appear in one `FormAlert` (`role="alert"`) fed by the
mutation's `error.message`.

### Data: API module, query hooks, no fetching in components

```text
api/client.ts       request<T>(path, { method, body, parse }) -> ApiError(message, status)
api/household.ts    typed functions with small runtime parsers
hooks/useHousehold  useQuery + useMutation, invalidate the query key on success
```

The client builds an absolute URL (`new URL(path, window.location.origin)`), turns a network failure into
`ApiError(..., 0)`, and uses the server `message` or a plain fallback per status. The query client does not retry
4xx responses, which will not change on retry.

### Routing: data mode with a layout route

`createBrowserRouter` with a pathless `AppLayout` (header, nav with `aria-current`, skip link, `Container` main,
footer). Each route carries `handle: { title }`; `useDocumentTitle` reads the deepest match with `useMatches`.
Keep the route array exported so tests can render the real routes in a memory router.

### Layout primitives

`Container` (width and gutters, can render as `main`/`header`/`section`) and `PageHeader` (one `h1`, description,
actions). The footer sits at the bottom with `min-h-dvh flex flex-col` on the shell and `flex-1` on main.

## Testing

| Level          | Tooling                                         | Pattern                                                         |
| -------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Backend API    | `@SpringBootTest`, WebTestClient, Testcontainers| Ordered tests share one throwaway Postgres                      |
| Backend unit   | JUnit parameterised                             | Decision functions are `static` and package-visible             |
| Frontend       | Vitest, Testing Library, MSW                    | `mockApi()` fake backend with rules and a request log           |
| End to end     | Playwright against the jar                      | Own tmpfs Postgres; one ordered journey plus shell tests        |

- `onUnhandledRequest: 'error'` makes any un-mocked request fail the test.
- Assert "no request was made" using the request log when validation should stop a submit.
- Prove each new test can fail: change the behaviour on purpose, watch it go red, restore it.

## Tooling

- **pm2 ecosystem as code:** a `.cjs` file computes the app list from `WM_MODE`; prod returns only the backend.
- **Scripts resolve the JDK:** `scripts/java-env.sh` finds a JDK 25 (env, jenv, `java_home`) so Gradle's
  toolchain works; `gradle.sh` and `run-backend-jar.sh` source it.
- **Fail fast:** the jar runner refuses a jar with no bundled UI when `WM_REQUIRE_UI=1`; the ecosystem file
  throws if `DB_PASSWORD` is missing.
- **Disposable e2e stack:** `start-stack.sh` starts the database, runs the jar as a child, and removes the database
  in a `trap` when Playwright stops it.
- **Hooks by cost:** fast checks on commit, slow checks on push, all driven from one `.pre-commit-config.yaml`.
