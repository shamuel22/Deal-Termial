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

| Ruta                                | Contenido                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `/`                                 | Landing pública                                                                        |
| `/knowledge`                        | Base de conocimientos con búsqueda                                                     |
| `/login` · `/register` · `/console` | Acceso y consola del dueño                                                             |
| `/api`                              | API REST (`/api/docs` para OpenAPI)                                                    |
| `/api/health`                       | Estado del servicio y de la base de datos                                              |
| `/mcp`                              | Servidor MCP para agentes ([guía](./docs/mcp.md), [herramientas](./docs/mcp-tools.md)) |
| `/webhooks/paypal`                  | Webhooks de PayPal (firma verificada)                                                  |

## Desarrollo

```bash
pnpm typecheck   # tipos de todo el monorepo
pnpm lint        # ESLint
pnpm test        # tests (usa TEST_DATABASE_URL)
```

Estructura: `apps/server` (NestJS), `apps/portal` (React + Vite), `packages/shared` (configuración y esquemas),
`packages/db` (Drizzle y migraciones).

## Datos de demostración

Con `DATABASE_URL` configurada (también se carga el `.env` de la raíz si existe):

```bash
pnpm build
pnpm seed:demo
```

Aplica migraciones y crea en una sola transacción tres empresas, cinco agentes con credenciales,
seis ofertas activas y dos autorizaciones de US$80. La salida muestra cuentas, contraseña, API keys
e IDs de autorización; guarda las claves al ejecutarlo. Si ya existe el dueño comprador, termina
con código 1 sin duplicar datos.

Puedes configurar `DEMO_PASSWORD` (por defecto `DealTerminal-demo-2026`),
`DEMO_SELLER_A_MERCHANT_ID` (por defecto `4Z22N6RZVZKAC`) y
`DEMO_SELLER_B_MERCHANT_ID` (por defecto `VW92JVJ8JBR7Q`). Consulta las
[cuentas, catálogo y condiciones de la demo](./docs/demo-data.md).

## Integración continua

GitHub Actions ejecuta el CI en cada push a `main` y en cada pull request hacia `main`,
con Node.js 24 y pnpm 11.22.0. Instala las dependencias con el lockfile congelado y comprueba,
en orden, formato, lint, tipos, compilación y tests de todo el monorepo.
Los tests disponen de PostgreSQL 18 y variables de configuración de prueba, sin secretos.
Una nueva ejecución cancela la anterior de la misma rama.

## Licencia

MIT
