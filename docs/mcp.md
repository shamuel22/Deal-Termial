# Conectar un agente a Deal Terminal por MCP

Deal Terminal expone sus herramientas comerciales con el [Model Context Protocol](https://modelcontextprotocol.io)
sobre **Streamable HTTP**. El agente (su modelo y su ciclo de herramientas) se ejecuta en el cliente; Deal Terminal
autentica, aplica permisos y ejecuta las operaciones. El catálogo completo está en
[`mcp-tools.md`](./mcp-tools.md).

| Dato          | Valor                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| URL           | `https://<tu-dominio>/mcp` (en local: `http://localhost:3000/mcp`)                                         |
| Transporte    | Streamable HTTP, sin estado (`POST` con JSON-RPC)                                                          |
| Autenticación | Cabecera `Authorization: Bearer <credencial del agente>`                                                   |
| Credencial    | La emite el dueño en el portal (Agentes → Emitir credencial). Empieza por `dtk_` y se muestra una sola vez |

La credencial identifica al agente y a su organización. El **nivel de acceso** (solo búsqueda, solo negociación o
autonomía total), las autorizaciones de compra y las facultades de venta se resuelven en el servidor en cada
llamada: cambiarlos o revocarlos en el portal surte efecto en la siguiente herramienta que use el agente.

> La credencial es un secreto del software cliente. Configúrala como variable de entorno o cabecera del cliente;
> nunca la pegues en la conversación con el modelo.

## Claude Code

```bash
claude mcp add --transport http deal-terminal https://<tu-dominio>/mcp \
  --header "Authorization: Bearer ${DEAL_TERMINAL_KEY}"
```

## Codex CLI

En `~/.codex/config.toml`:

```toml
[mcp_servers.deal_terminal]
url = "https://<tu-dominio>/mcp"
bearer_token_env_var = "DEAL_TERMINAL_KEY"
```

y exporta `DEAL_TERMINAL_KEY` antes de iniciar Codex.

## Otros clientes

Cualquier cliente MCP con transporte Streamable HTTP y cabeceras personalizadas sirve. Con el SDK oficial de
TypeScript:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'mi-agente', version: '1.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('https://<tu-dominio>/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${process.env.DEAL_TERMINAL_KEY}` } },
  }),
);
const status = await client.callTool({ name: 'get_authorization_status', arguments: {} });
```

## Flujo recomendado para el agente comprador

El servidor envía estas instrucciones al conectarse; se resumen aquí:

1. `get_authorization_status`: nivel, autorizaciones y presupuesto disponible.
2. `create_request` con `authorizationId` → `find_matches` con el `requestId`.
3. `request_quote` sobre la mejor oferta → `counter_quote` mientras haga falta. `authorizationCheck` indica si la
   propuesta ya cabe en la autorización.
4. Según el nivel: `submit_for_review` (solo negociación) o `execute_purchase` (autonomía total).
5. `get_order` para seguir el estado comercial, financiero y de entrega.

## Errores

Una herramienta que falla devuelve `isError: true` con un objeto `{ error: { code, message, hint, details } }`.
`code` es estable (p. ej. `LEVEL_INSUFFICIENT`, `BUDGET_EXCEEDED`, `QUOTE_EXPIRED`, `AUTHORIZATION_REVOKED`) y
`hint` explica qué puede hacer el agente o el dueño.

## Pago

Con autonomía total, `execute_purchase` verifica la delegación de nuevo justo antes de pagar. Si existe una
autorización financiera PayPal que cubra al proveedor, cobra sin checkout. Hoy PayPal no ofrece guardar un medio
de pago reutilizable con varios vendedores ([detalle](./paypal-spike.md)), así que el pedido queda **aceptado y
pendiente de pago del dueño** (`payment.status = owner_action_required`), que recibe una notificación y paga con
un checkout de un clic.
