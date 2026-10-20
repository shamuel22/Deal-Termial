# Video de presentación (≤ 3 min)

Guion para grabar la demo del hackatón. La narración va en inglés (idioma del producto y de los jueces); las
indicaciones de producción, en español.

## Formato

- **Pantalla dividida:** a la izquierda, Claude Code en la terminal conectado al MCP de producción; a la derecha, la
  consola del dueño (`https://dealterminal.lucuo.dev/console`) en el navegador.
- Grabar por tramos y montar después. La terminal puede ir a 2× en los tramos largos; la voz en off se graba aparte.
- 1080p o 1440p, zoom suficiente para que la terminal se lea.
- Nunca mostrar la credencial `dtk_…`, `demo_data.md` ni el `.env`.

## Preparación (una vez, antes de grabar)

Estado de producción preparado el 2026-10-20: autorización nueva del _Purchasing assistant_ con $80.00 disponibles
(entrega antes del 2026-10-30) y una credencial en `~/.deal-terminal-demo-key` (solo legible por tu usuario).

```bash
mkdir -p ~/deal-demo && cd ~/deal-demo          # carpeta vacía: Claude Code no ve el código del proyecto
export DEAL_TERMINAL_KEY="$(cat ~/.deal-terminal-demo-key)"
claude mcp add --transport http deal-terminal https://dealterminal.lucuo.dev/mcp \
  --header "Authorization: Bearer ${DEAL_TERMINAL_KEY}"
claude --allowedTools "mcp__deal-terminal"     # las herramientas de Deal Terminal no piden confirmación en cámara
```

En el navegador: sesión iniciada como `owner@taqueria-elsol.demo` (contraseña de demo) y, en otra pestaña, la
cuenta compradora de PayPal sandbox lista para aprobar.

Ensayo realizado con Claude Code en modo no interactivo y la misma petición: 14 pasos, ~35 s. Pidió cotización a
GreenBox ($81.19) y EcoPack ($83.35), contraofertó a ambos, eligió GreenBox a **$76.32** y dejó el pedido pendiente
del pago del dueño. El pedido del ensayo se canceló y el presupuesto volvió a $80.00.

## Guion

| Tiempo    | Pantalla            | Acción                                                                                                                                                                                | Narración                                                                                                                                                                                                                                                              |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | Landing             | Recargar `/` y dejar correr la animación del hero.                                                                                                                                    | "AI agents can already search and negotiate. What they can't do safely is spend a company's money. Deal Terminal is a B2B marketplace where agents buy within the limits an owner sets — and the server enforces them."                                                |
| 0:15–0:40 | Consola             | **Agents**: los tres niveles. **Authorizations**: encargo de 300 envases, $80.00 máximo, dirección, entrega y caducidad.                                                              | "The owner gives each agent a level — search only, negotiate only, or full autonomy — and a purchase authorization: what to buy, up to how much, delivered where and by when. Authority comes from these structured terms, not from the conversation."                 |
| 0:40–1:45 | Terminal (2×)       | Escribir la petición de abajo y dejar trabajar al agente. Se ven `get_authorization_status`, `create_request`, `find_matches`, `request_quote`, `counter_quote` y `execute_purchase`. | "This is Claude Code, connected over MCP — no custom integration. Every offer is over budget, so it negotiates with two suppliers. Neither is online: their private rules answer instantly. GreenBox comes down from $81.19 to $76.32, and the agent closes the deal." |
| 1:45–2:15 | Consola → PayPal    | **Overview → To pay → Pay →** → pedido → **Continue in PayPal** → aprobar en PayPal sandbox → vuelta al pedido → **Paid**.                                                            | "PayPal can't yet save a buyer's wallet for every seller on a marketplace, so the owner approves the payment in one step. The money goes straight to the supplier's PayPal account, and the server confirms it through signed webhooks — never trusting the redirect." |
| 2:15–2:35 | Consola + terminal  | **Authorizations → Revoke access** sobre la autorización. Luego, en la terminal, la segunda petición de abajo: el agente ya no tiene una autorización activa y lo explica.            | "The owner stays in control. Revoke the authorization and the very next call is refused by the server — whatever the model decides. Every check and decision lands in the activity log."                                                                               |
| 2:35–2:55 | Knowledge / esquema | Página `/knowledge/mcp` y, si se quiere, un esquema simple: _Model → MCP / REST → Deal Terminal (policy) → PayPal_.                                                                   | "The model decides what to do. Deal Terminal decides what is allowed. PayPal moves the money. Any MCP client can plug in today. Deal Terminal — your agent, your terms, business done."                                                                                |

### Peticiones al agente

Tramo 0:40 (compra):

> We need to restock: buy another 300 food containers for next week, as described in my new purchase authorization
> on Deal Terminal. This is a new order, separate from the one already paid. Get the best deal you can.

Tramo 2:15 (tras revocar):

> Buy 300 more containers for the following week under my purchase authorization.

## Después de grabar

- La autorización queda revocada a propósito. Si hace falta otra toma, crear una nueva desde **Authorizations → New
  purchase authorization** con los mismos términos.
- Revocar la credencial del agente usada en el video (**Agents → Purchasing assistant → Revoke access**) si el video
  se va a publicar con la terminal visible durante la configuración.
