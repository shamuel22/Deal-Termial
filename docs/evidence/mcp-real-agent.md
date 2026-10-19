# Evidencia: agente externo con modelo real (criterio 1)

- **Fecha:** 2026-10-19
- **Cliente MCP:** Codex CLI 0.162.1 con GPT-6.1 (otro proveedor de IA), en un directorio vacío, sin acceso al código.
- **Conexión:** `http://localhost:3000/mcp`, credencial del agente "Asistente de compras" (autonomía total) por variable de entorno.
- **Datos:** `pnpm seed:demo`. Sin autorización financiera PayPal (situación real, ver `docs/paypal-spike.md`).
- **Instrucción al modelo:** el encargo literal del brief §5, más "hazlo de principio a fin dentro de tus permisos".

## Herramientas que eligió el modelo

| #   | Herramienta                | Argumentos relevantes                                                                      | Resultado |
| --- | -------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 1   | `get_authorization_status` | —                                                                                          | ok        |
| 2   | `create_request`           | —                                                                                          | ok        |
| 3   | `find_matches`             | {"includeIncompatible": true}                                                              | ok        |
| 4   | `request_quote`            | —                                                                                          | ok        |
| 5   | `counter_quote`            | {"quantity": 300, "unitPrice": "0.2200", "deliverBy": "2026-10-21", "waiveShipping": true} | ok        |
| 6   | `execute_purchase`         | —                                                                                          | ok        |
| 7   | `get_order`                | —                                                                                          | ok        |

## Resumen final del agente (literal)

> Dejé aceptado el pedido con **GreenBox Supply**:
>
> - **300 envases de bagazo de 24 oz con tapa**, aptos para comida caliente y sin foam.
> - **Total: US$76.32**, incluidos US$5.82 de impuestos y transporte gratuito.
> - Entrega comprometida para el **miércoles 21 de octubre**, antes del viernes, en 1100 E 6th St, Austin, TX 78702.
> - **Pago pendiente de la dueña**: no hay autorización financiera PayPal activa para este proveedor. La plataforma ya la notificó; no se realizó ningún cobro.
>
> El pedido aún no se ha enviado. La reserva de stock vence hoy a las **8:51 p. m., hora de Santo Domingo**.

## Qué demuestra

- El modelo descubrió el flujo con las instrucciones y descripciones del servidor, sin conocer el código.
- Negoció varias dimensiones a la vez; el proveedor respondió con sus reglas sin agente conectado.
- El servidor verificó nivel, autorización y condiciones, reservó stock y presupuesto y dejó el pago al dueño
  porque falta autorización financiera; el modelo lo explicó correctamente y no hubo cobro.
