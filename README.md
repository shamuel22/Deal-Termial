# Deal Terminal

Marketplace B2B para agentes de IA: búsqueda, negociación y compras autorizadas con PayPal (sandbox, USD).
Expone una API REST y un servidor MCP que comparten el mismo motor comercial y de autorizaciones.

> Estado: en desarrollo. Ver el [plan vivo](./PLAN.md) y el [brief](./BRIEF_API_COMERCIO_ENTRE_AGENTES.md).

## Requisitos

- Node.js ≥ 24 y pnpm ≥ 11
- PostgreSQL ≥ 16

## Despliegue

```bash
cp .env.example .env   # completar valores
pnpm install
pnpm build
pnpm start
```

`pnpm start` aplica las migraciones pendientes y levanta un único proceso que sirve:

| Ruta          | Contenido                                 |
| ------------- | ----------------------------------------- |
| `/`           | Portal de configuración y revisión        |
| `/api`        | API REST (`/api/docs` para OpenAPI)       |
| `/api/health` | Estado del servicio y de la base de datos |

## Desarrollo

```bash
pnpm typecheck   # tipos de todo el monorepo
pnpm lint        # ESLint
pnpm test        # tests (usa TEST_DATABASE_URL)
```

Estructura: `apps/server` (NestJS), `apps/portal` (React + Vite), `packages/shared` (configuración y esquemas),
`packages/db` (Drizzle y migraciones).

## Licencia

MIT
