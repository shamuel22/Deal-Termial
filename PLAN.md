# Plan vivo — Deal Terminal MVP

> Documento vivo. Se actualiza en cada avance: casillas, decisiones, bloqueos y bitácora.
> Fuente de requisitos: [`BRIEF_API_COMERCIO_ENTRE_AGENTES.md`](./BRIEF_API_COMERCIO_ENTRE_AGENTES.md) (v2.0).
> Responsable técnico: Claude (senior). Apoyo: Codex CLI (GPT-6.1) en tareas delegadas y supervisadas.

**Estado actual:** Etapa 0 ✅ · Etapa 1 🔄 (vault a nivel plataforma bloqueado, ver `docs/paypal-spike.md`) · **Última actualización:** 2026-10-19

---

## 1. Principios de trabajo

1. **Etapas pequeñas y verificables.** Cada etapa termina con un resultado demostrable, tests en verde y un commit (o varios) publicado en GitHub.
2. **La seguridad del dinero no se delega.** El motor de autorizaciones, las reservas de presupuesto/stock, la idempotencia y la integración de pagos PayPal los escribe y revisa Claude directamente.
3. **Un solo motor de negocio.** API REST y servidor MCP llaman a los mismos servicios; no hay lógica comercial duplicada.
4. **Determinismo en el servidor.** Sin IA interna. Búsqueda, validación, autorización y pago son reglas y algoritmos verificables.
5. **Nada se da por hecho.** Datos desconocidos se devuelven como pendientes, nunca como confirmados.
6. **Main siempre desplegable.** Todo commit en `main` compila, pasa tests y respeta el contrato de despliegue.

## 2. Contrato de despliegue (VPS)

```bash
pnpm install
pnpm build
pnpm start
```

- Requisitos del VPS: Node.js ≥ 24, pnpm ≥ 11, PostgreSQL ≥ 16, archivo `.env` (plantilla en `.env.example`).
- `pnpm start` aplica migraciones pendientes y levanta **un único proceso Node** que sirve:
  - `/api/*` — API REST (OpenAPI en `/api/docs`)
  - `/mcp` — servidor MCP (Streamable HTTP)
  - `/webhooks/paypal` — webhooks PayPal
  - `/` — portal React compilado (estáticos)
  - Procesador de tareas (pg-boss) en el mismo proceso.
- Sin Redis ni Docker obligatorios. Docker/compose y guía systemd + nginx/TLS se documentan como opcionales.
- Comando auxiliar: `pnpm seed:demo` carga datos y cuentas de prueba.

## 3. Arquitectura y stack

| Pieza      | Elección                                                 | Motivo                                                       |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Monorepo   | pnpm workspaces (`pnpm -r` topológico)                   | Simple, sin herramientas extra                               |
| Lenguaje   | TypeScript estricto                                      | Requisito del brief                                          |
| API        | NestJS + OpenAPI (`@nestjs/swagger`)                     | Requisito del brief                                          |
| MCP        | SDK oficial `@modelcontextprotocol/sdk`, montado en Nest | Comparte servicios con la API                                |
| BD         | PostgreSQL + Drizzle ORM + migraciones SQL               | Control explícito de transacciones, `FOR UPDATE`, `numeric`  |
| Dinero     | `numeric(14,2)` en BD + `decimal.js` en código           | Precisión decimal (§10 del brief)                            |
| Tareas     | pg-boss (sobre Postgres)                                 | Webhooks, reintentos, expiraciones, reconciliación sin Redis |
| Validación | zod (esquemas compartidos API/MCP)                       | Un esquema → validación + OpenAPI + MCP                      |
| Portal     | React + Vite (estático servido por Nest)                 | Requisito del brief                                          |
| Tests      | Vitest + Postgres real de test                           | Concurrencia y transacciones se prueban contra BD real       |
| CI         | GitHub Actions: lint, typecheck, tests, build            | Main siempre verde                                           |

Estructura prevista:

```
apps/
  server/        # NestJS: API, MCP, webhooks, jobs, sirve el portal
  portal/        # React + Vite
packages/
  core/          # Servicios de negocio, motor de permisos, reglas, dinero
  db/            # Esquema Drizzle, migraciones, seed
  paypal/        # Cliente PayPal tipado (sin secretos expuestos)
  shared/        # Esquemas zod, tipos, códigos de error
spikes/
  paypal-vault/  # Prueba de viabilidad financiera (Etapa 1)
docs/
```

## 4. Etapas

Leyenda: ⬜ pendiente · 🔄 en curso · ✅ hecho · ⛔ bloqueado
Columna **Quién**: C = Claude · X = Codex (bajo revisión de Claude)

### Etapa 0 — Fundaciones del repositorio

**Resultado verificable:** `pnpm install && pnpm build && pnpm start` levanta un servidor con `/api/health` y CI en verde.

| #   | Tarea                                                                       | Quién | Estado |
| --- | --------------------------------------------------------------------------- | ----- | ------ |
| 0.1 | `git init`, remoto GitHub, `.gitignore`, licencia                           | C     | ✅     |
| 0.2 | Monorepo pnpm, TS estricto, ESLint, Prettier                                | C     | ✅     |
| 0.3 | Esqueleto Nest con `/api/health` y config validada por zod desde `.env`     | C     | ✅     |
| 0.4 | Paquete `db` con Drizzle, migración vacía y migración automática en `start` | C     | ✅     |
| 0.5 | Vitest + BD de test; GitHub Actions (lint, typecheck, test, build)          | X     | ✅     |
| 0.6 | `.env.example`, README inicial con contrato de despliegue                   | C     | ✅     |

### Etapa 1 — Prueba de viabilidad financiera (GATE)

**Resultado verificable:** en sandbox, consentimiento inicial → token persistente → pago al proveedor A sin nuevo checkout → mismo token contra proveedor B. Hallazgos en `docs/paypal-spike.md`.
**Regla:** si falla, se resuelve la configuración sandbox; no se sustituye por pago simulado.

| #   | Tarea                                                                                                           | Quién | Estado |
| --- | --------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| 1.1 | Investigar y fijar endpoints vigentes (Partner Referrals, Vault v3 setup/payment tokens, Orders v2 con `payee`) | C     | ✅     |
| 1.2 | Onboarding sandbox de proveedor A y B; comprobar `payments_receivable` y `primary_email_confirmed`              | C     | 🔄     |
| 1.3 | Flujo de consentimiento comprador (setup token → aprobación → payment token)                                    | C     | ✅     |
| 1.4 | Pago posterior a proveedor A con el token, sin checkout                                                         | C     | 🔄     |
| 1.5 | Pago con el mismo token a proveedor B (alcance a nivel plataforma)                                              | C     | ⬜     |
| 1.6 | Reembolso sandbox y recepción/verificación de webhook                                                           | C     | 🔄     |
| 1.7 | Documento de hallazgos y decisión de diseño final de pagos                                                      | C     | ⬜     |

### Etapa 2 — Modelo de datos y núcleo

**Resultado verificable:** migraciones de todas las entidades del §11 y librería de dinero con tests.

| #   | Tarea                                                                                                                                  | Quién | Estado |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| 2.1 | Esquema: organización, usuario, membresía/rol, agente, credencial de agente                                                            | C     | ⬜     |
| 2.2 | Esquema: autorización versionada, concesión de nivel, conexión PayPal                                                                  | C     | ⬜     |
| 2.3 | Esquema: producto, oferta, tramos de precio, existencias, reglas de negociación del proveedor                                          | C     | ⬜     |
| 2.4 | Esquema: solicitud, cotización versionada, pedido, reservas (stock y presupuesto), intento de pago, reembolso, auditoría, idempotencia | C     | ⬜     |
| 2.5 | Módulo `money` (decimal, USD, redondeo explícito) + tests                                                                              | C     | ⬜     |
| 2.6 | Catálogo de errores accionables (§12) compartido API/MCP                                                                               | C     | ⬜     |

### Etapa 3 — Identidad, organizaciones y aislamiento

**Resultado verificable:** test que demuestra que una organización no puede leer ni modificar recursos de otra (criterio 16).

| #   | Tarea                                                                                  | Quién | Estado |
| --- | -------------------------------------------------------------------------------------- | ----- | ------ |
| 3.1 | Registro/login de propietarios (sesión segura, cookies httpOnly)                       | C     | ⬜     |
| 3.2 | Alta de agentes y emisión de credenciales (hash en BD, mostradas una vez)              | C     | ⬜     |
| 3.3 | Contexto de actor (`org`, `agente`, `nivel`) resuelto por el servidor en cada petición | C     | ⬜     |
| 3.4 | Guardas de aislamiento por organización y tests                                        | C     | ⬜     |
| 3.5 | Registro de auditoría transversal                                                      | C     | ⬜     |

### Etapa 4 — Motor de autorizaciones y presupuesto

**Resultado verificable:** criterios 3, 4, 6, 7, 8, 11, 13 cubiertos por tests unitarios y de concurrencia.

| #   | Tarea                                                                                                             | Quién             | Estado |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------- | ------ |
| 4.1 | Niveles por agente; cambio de nivel y revocación solo por sesión de propietario                                   | C                 | ⬜     |
| 4.2 | Autorización de compra versionada (encargo, atributos, cantidades, proveedores, presupuesto, entrega, expiración) | C                 | ⬜     |
| 4.3 | Motor de políticas puro: `check(actor, acción, recurso) → permitido                                               | error accionable` | C      | ⬜  |
| 4.4 | Libro de presupuesto: reservar/consumir/liberar por encargo y mes UTC, transaccional con bloqueo                  | C                 | ⬜     |
| 4.5 | Solicitudes de cambio de permisos por el agente (solo propuesta)                                                  | C                 | ⬜     |
| 4.6 | Tests de concurrencia: dos compras simultáneas no superan presupuesto                                             | C                 | ⬜     |

### Etapa 5 — Catálogo y búsqueda

**Resultado verificable:** búsqueda del caso “300 envases con tapa, comida caliente, sin foam, ≤ US$80, antes del viernes” devuelve alternativas con total, condiciones y campos pendientes.

| #   | Tarea                                                                                                | Quién | Estado |
| --- | ---------------------------------------------------------------------------------------------------- | ----- | ------ |
| 5.1 | Taxonomía normalizada de envases (material, capacidad, apto caliente, tapa, presentación)            | C     | ⬜     |
| 5.2 | CRUD de productos/ofertas del proveedor con tramos por cantidad, stock, zonas y plazos               | X     | ⬜     |
| 5.3 | Motor de coincidencia por atributos, presupuesto, zona y fecha; cálculo de totales; campos faltantes | C     | ⬜     |
| 5.4 | Solicitudes privadas (`create_request`, `get_request`)                                               | C     | ⬜     |
| 5.5 | Datos semilla: dos proveedores, catálogo de envases realista                                         | X     | ⬜     |

### Etapa 6 — Negociación

**Resultado verificable:** RFQ → cotización automática por reglas → contrapropuesta → respuesta automática o pendiente de proveedor, con historial versionado.

| #   | Tarea                                                                                             | Quién | Estado |
| --- | ------------------------------------------------------------------------------------------------- | ----- | ------ |
| 6.1 | RFQ y cotización versionada (reemplazo, expiración)                                               | C     | ⬜     |
| 6.2 | Reglas del proveedor: precio mínimo por tramo, descuento máximo, cantidades, ventanas de entrega  | C     | ⬜     |
| 6.3 | Respuesta automática determinista dentro de reglas; excepciones → pendiente de proveedor          | C     | ⬜     |
| 6.4 | Herramientas de proveedor: `list_pending_negotiations`, `submit_quote`, `respond_to_counterquote` | C     | ⬜     |
| 6.5 | `submit_for_review` (solo negociación deja propuesta final al dueño)                              | C     | ⬜     |

### Etapa 7 — Pedidos, reservas e idempotencia

**Resultado verificable:** criterios 10, 12 y validaciones del §10 en tests.

| #   | Tarea                                                                                         | Quién | Estado |
| --- | --------------------------------------------------------------------------------------------- | ----- | ------ |
| 7.1 | `accept_quote`: validación completa (§10) + reserva de stock y presupuesto en una transacción | C     | ⬜     |
| 7.2 | Claves de idempotencia para escrituras críticas                                               | C     | ⬜     |
| 7.3 | Máquina de estados de pedido; cancelación antes del pago                                      | C     | ⬜     |
| 7.4 | Expiración de reservas e incidencia por pago tardío                                           | C     | ⬜     |

### Etapa 8 — Pagos PayPal en producto

**Resultado verificable:** pago manual, pago delegado, rechazo por límite/revocación y webhook repetido (criterios 5, 9, 14, 15, 17).

| #   | Tarea                                                                              | Quién | Estado |
| --- | ---------------------------------------------------------------------------------- | ----- | ------ |
| 8.1 | Paquete `paypal`: cliente tipado, OAuth, reintentos seguros, sin filtrar secretos  | C     | ⬜     |
| 8.2 | Conexión de proveedor (onboarding) y estados                                       | C     | ⬜     |
| 8.3 | Conexión financiera del comprador (vault) con los 5 estados del §8                 | C     | ⬜     |
| 8.4 | Checkout manual (solo negociación)                                                 | C     | ⬜     |
| 8.5 | `execute_purchase` delegado: doble verificación, idempotente, token nunca expuesto | C     | ⬜     |
| 8.6 | Webhooks: verificación de firma, deduplicación, eventos fuera de orden             | C     | ⬜     |
| 8.7 | Reconciliación de resultados desconocidos (consulta antes de reintentar)           | C     | ⬜     |
| 8.8 | Reembolsos con facultad del proveedor; sin restaurar presupuesto delegado          | C     | ⬜     |

### Etapa 9 — Servidor MCP

**Resultado verificable:** un cliente MCP externo con modelo real ejecuta el recorrido completo (criterio 1).

| #   | Tarea                                                                        | Quién | Estado |
| --- | ---------------------------------------------------------------------------- | ----- | ------ |
| 9.1 | Montaje MCP Streamable HTTP en Nest + autenticación por credencial de agente | C     | ⬜     |
| 9.2 | Herramientas del comprador (§9) sobre servicios `core`                       | C     | ⬜     |
| 9.3 | Herramientas del proveedor                                                   | C     | ⬜     |
| 9.4 | Descripciones de herramientas orientadas a modelos + errores accionables     | C     | ⬜     |
| 9.5 | Test automatizado: ninguna respuesta MCP contiene tokens/secretos            | C     | ⬜     |

### Etapa 10 — Portal y consola

**Resultado verificable:** el dueño configura todo, revisa y paga una propuesta, y ve la actividad.

| #    | Tarea                                                                      | Quién | Estado |
| ---- | -------------------------------------------------------------------------- | ----- | ------ |
| 10.1 | Shell React, auth, navegación, cliente API generado de OpenAPI             | X     | ⬜     |
| 10.2 | Agentes: alta, credencial, nivel, revocación                               | X     | ⬜     |
| 10.3 | Formulario de autorización estructurada + vista previa antes de activar    | X     | ⬜     |
| 10.4 | Estado de las dos autorizaciones y conexión PayPal guiada                  | C     | ⬜     |
| 10.5 | Revisión de propuesta final, aceptación y checkout manual                  | C     | ⬜     |
| 10.6 | Portal de proveedor: ofertas, reglas, negociaciones pendientes, reembolsos | X     | ⬜     |
| 10.7 | Consola de actividad/auditoría y notificaciones en producto                | X     | ⬜     |

### Etapa 11 — Verificación y demo

**Resultado verificable:** los 18 criterios de aceptación con prueba asociada; demo reproducible.

| #    | Tarea                                                                  | Quién | Estado |
| ---- | ---------------------------------------------------------------------- | ----- | ------ |
| 11.1 | Matriz criterio → test/evidencia (`docs/acceptance.md`)                | C     | ⬜     |
| 11.2 | Script e2e de los recorridos principal y complementarios               | C     | ⬜     |
| 11.3 | Revisión de seguridad (aislamiento, secretos, permisos)                | C     | ⬜     |
| 11.4 | Despliegue en el VPS y prueba desde cero con el contrato de despliegue | C     | ⬜     |

### Etapa 12 — Documentación y entrega

| #    | Tarea                                                                     | Quién | Estado |
| ---- | ------------------------------------------------------------------------- | ----- | ------ |
| 12.1 | README final, variables de entorno, guía de despliegue VPS                | C     | ⬜     |
| 12.2 | Catálogo de herramientas MCP y guía de conexión del cliente               | X     | ⬜     |
| 12.3 | Especificación comercial y de autorizaciones v0.2                         | C     | ⬜     |
| 12.4 | Instrucciones para jueces y cuentas sandbox                               | C     | ⬜     |
| 12.5 | Guion del video (< 3 min) y explicación del papel de los modelos y PayPal | C     | ⬜     |

## 5. Protocolo de trabajo con Codex

- **Qué se delega:** tareas acotadas y de bajo riesgo: CI, CRUD, componentes del portal, datos semilla, tests repetitivos, documentación.
- **Qué no se delega:** autorizaciones, presupuesto, reservas, idempotencia, PayPal, autenticación, aislamiento.
- **Cómo:** cada tarea se ejecuta con `codex exec` en un **git worktree propio** y rama `codex/<etapa>-<tarea>`, con un prompt que incluye: objetivo, archivos permitidos, convenciones, criterios de aceptación y comandos de verificación.
- **Revisión:** Claude revisa el diff completo, ejecuta lint/typecheck/tests, corrige o rechaza, y solo entonces integra en `main`.
- **Codex no recibe secretos** (`.env`, credenciales PayPal) ni hace push.

## 6. Convenciones de Git y calidad

- Rama principal: `main` (siempre verde). Trabajo de Codex en ramas `codex/*` integradas por Claude.
- Commits pequeños con Conventional Commits en español: `feat(core): reserva transaccional de presupuesto`.
- Push a GitHub tras cada commit para que el equipo vea el avance en tiempo real.
- Tag por etapa completada: `etapa-0`, `etapa-1`, …
- Definición de terminado por tarea: compila, lint y typecheck limpios, tests nuevos en verde, sin secretos, plan actualizado.
- Secretos solo en `.env` (ignorado). `.env.example` sin valores reales.

## 7. Decisiones tomadas

| Fecha      | Decisión                                                                                                                                             | Motivo                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 2026-10-19 | Proceso único Node que sirve API, MCP, webhooks, portal y tareas                                                                                     | Contrato de despliegue simple en VPS                                                  |
| 2026-10-19 | Postgres + Drizzle + pg-boss, sin Redis                                                                                                              | Menos piezas; transacciones y colas en la misma BD                                    |
| 2026-10-19 | Autenticación de agentes por credencial propia por agente (hash en BD); OAuth evaluable después                                                      | Compatible con clientes MCP actuales y simple de auditar                              |
| 2026-10-19 | Reserva de stock al aceptar, no al cotizar                                                                                                           | Evita bloqueo de inventario por consultas                                             |
| 2026-10-19 | TypeScript 6.0.3 (no 7): Nest necesita `emitDecoratorMetadata` y typescript-eslint soporta < 6.1                                                     | Compatibilidad                                                                        |
| 2026-10-19 | Todo el monorepo en ESM (NestJS 12 es ESM)                                                                                                           | Coherencia de módulos                                                                 |
| 2026-10-19 | Se respeta la edad mínima de publicación de pnpm 11: no se usan versiones del mismo día; scripts de instalación solo en lista blanca (`allowBuilds`) | Seguridad de la cadena de suministro                                                  |
| 2026-10-19 | Cobro por la plataforma + Payouts al proveedor queda solo como posibilidad, no se implementa                                                         | Complica reembolsos y conciliación; contradice el pago directo al proveedor del brief |
| 2026-10-19 | PayPal Agent Toolkit / AI-Toolkit no se usa para el vault: cubre órdenes, reembolsos, facturas, etc., sin vault ni multiparty                        | Revisado; sus guías de webhooks y reembolsos sirven de referencia                     |
| 2026-10-19 | Herramientas añadidas: `submit_for_review`, `request_authorization_change`, `list_pending_negotiations`, `approve_refund`                            | Cubren huecos del §3, §4 y §9 del brief                                               |

## 8. Pendientes de decisión / insumos del equipo

| #   | Tema                                                                                          | Propuesta por defecto                 | Estado             |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------ |
| P1  | Cuentas sandbox: app ✅, compradora ✅, plataforma ✅; faltan 2 business de proveedores       | —                                     | ⛔ Bloquea Etapa 1 |
| P2  | Fecha límite del hackatón                                                                     | —                                     | Abierto            |
| P3  | Cliente MCP de referencia                                                                     | Claude Code / Claude Desktop vía HTTP | Abierto            |
| P4  | Dominio y TLS del VPS (necesario para webhooks y retorno de PayPal)                           | nginx + Let's Encrypt                 | Abierto            |
| P5  | Licencia                                                                                      | MIT                                   | Asumido (MIT)      |
| P7  | Habilitación de vault PayPal a nivel plataforma (`usage_type: PLATFORM`) en la app sandbox    | Solicitar a PayPal                    | ⛔ Abierto         |
| P8  | Webhook en PayPal apunta a la raíz; debe ser `https://dealterminal.lucuo.dev/webhooks/paypal` | Actualizar en el dashboard            | Abierto            |
| P6  | Visibilidad del repo (hoy privado; el brief exige público al entregar)                        | Hacer público antes de la entrega     | Abierto            |

## 9. Riesgos

| Riesgo                                                               | Impacto                       | Mitigación                                                 |
| -------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Vault a nivel plataforma requiere habilitación de partner en sandbox | Alto: bloquea autonomía total | Etapa 1 primero; escalar con soporte PayPal pronto         |
| Token no válido para el segundo proveedor                            | Alto                          | Detectarlo en 1.5 y documentar alternativa conforme        |
| Webhooks requieren URL pública                                       | Medio                         | Túnel (cloudflared) en desarrollo; dominio en VPS          |
| Concurrencia en presupuesto/stock                                    | Alto                          | Bloqueos de fila + tests concurrentes contra Postgres real |
| Fuga de secretos en respuestas MCP                                   | Alto                          | Serialización por lista blanca + test automático           |

## 10. Bitácora

- **2026-10-19** — Brief leído y analizado. Plan vivo creado.
- **2026-10-19** — Etapa 0 completa: monorepo, servidor con `/api/health`, portal, migraciones al arrancar, CI (Codex, revisado). Contrato `pnpm install → build → start` verificado en local.
- **2026-10-19** — Consentimiento aprobado por el comprador sandbox; token persistente, cobro sin checkout y reembolso ✅. Falta probar pago a proveedores distintos de la plataforma (se necesitan 2 cuentas business adicionales).
- **2026-10-19** — Etapa 1 iniciada: Partner Referrals ✅, vault PayPal a nivel comerciante ✅, a nivel plataforma ❌ (`NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE`). Faltan cuentas sandbox para aprobar consentimiento y probar cobro a proveedores.
