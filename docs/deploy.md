# Despliegue en un VPS

Deal Terminal se despliega como **un único proceso Node** que sirve el portal, la API, el servidor MCP, los webhooks
de PayPal y las tareas periódicas. Solo necesita Node.js y PostgreSQL.

```bash
pnpm install
pnpm build
pnpm start
```

## 1. Requisitos

- Node.js ≥ 24 y pnpm ≥ 11 (`corepack enable` activa la versión fijada en `package.json`).
- PostgreSQL ≥ 16.
- Un dominio con HTTPS (necesario para los retornos y webhooks de PayPal). En esta guía: `dealterminal.lucuo.dev`.

## 2. Base de datos

```bash
sudo -u postgres psql <<'SQL'
CREATE USER deal_terminal WITH PASSWORD 'cambia-esta-contraseña';
CREATE DATABASE deal_terminal OWNER deal_terminal;
SQL
```

Las migraciones se aplican solas en cada `pnpm start`.

## 3. Código y configuración

```bash
git clone https://github.com/shamuel22/Deal-Termial.git /opt/deal-terminal
cd /opt/deal-terminal
cp .env.example .env
chmod 600 .env
```

Completa `.env`:

| Variable                                    | Valor                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                  | `production`                                                                                  |
| `PORT` / `HOST`                             | `3000` / `127.0.0.1` (solo accesible a través de nginx)                                       |
| `PUBLIC_BASE_URL`                           | `https://dealterminal.lucuo.dev`                                                              |
| `DATABASE_URL`                              | `postgres://deal_terminal:<contraseña codificada>@localhost:5432/deal_terminal` (`@` → `%40`) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | App REST sandbox (Developer Dashboard)                                                        |
| `PAYPAL_WEBHOOK_ID`                         | ID del webhook (paso 6)                                                                       |
| `PAYPAL_PARTNER_MERCHANT_ID`                | Merchant ID de la cuenta dueña de la app                                                      |
| `PAYPAL_BN_CODE`                            | BN code de la app (sección _Multiparty features_)                                             |
| `SCHEDULER_INTERVAL_MS`                     | `60000`                                                                                       |

```bash
pnpm install
pnpm build
pnpm seed:demo   # opcional: datos de la demo (imprime cuentas y credenciales de agentes una sola vez)
```

> `NODE_ENV=production` va en `.env` (lo lee el servidor), no exportado en la shell: si la shell lo tiene,
> `pnpm install` omite TypeScript y Vite y `pnpm build` falla.

## 4. Servicio systemd

`/etc/systemd/system/deal-terminal.service`:

```ini
[Unit]
Description=Deal Terminal
After=network.target postgresql.service

[Service]
Type=simple
User=deal
WorkingDirectory=/opt/deal-terminal
ExecStart=/usr/bin/env pnpm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /opt/deal-terminal deal
sudo chown -R deal: /opt/deal-terminal
sudo systemctl enable --now deal-terminal
curl -s http://127.0.0.1:3000/api/health   # {"status":"ok","database":"ok"}
```

## 5. nginx y TLS

`/etc/nginx/sites-available/deal-terminal`:

```nginx
server {
  server_name dealterminal.lucuo.dev;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/deal-terminal /etc/nginx/sites-enabled/
sudo certbot --nginx -d dealterminal.lucuo.dev
sudo systemctl reload nginx
```

El servidor confía solo en un proxy local (`trust proxy = loopback`) para conocer la IP real del cliente.

## 6. PayPal

En el Developer Dashboard → app sandbox:

1. **Webhook:** URL `https://dealterminal.lucuo.dev/webhooks/paypal`, eventos "All events" (o al menos
   `CHECKOUT.ORDER.*`, `PAYMENT.CAPTURE.*`, `MERCHANT.*`, `VAULT.PAYMENT-TOKEN.DELETED`). Copia su ID a
   `PAYPAL_WEBHOOK_ID` y reinicia el servicio.
2. Los proveedores conectan su cuenta desde el portal (Pagos PayPal → Conectar con PayPal); el retorno usa
   `PUBLIC_BASE_URL`.

## 7. Actualizar

```bash
cd /opt/deal-terminal
git pull
pnpm install
pnpm build
sudo systemctl restart deal-terminal
```

## 8. Copias de seguridad

```bash
pg_dump -Fc -U deal_terminal deal_terminal > /var/backups/deal-terminal-$(date +%F).dump
```

## Rutas del servicio

| Ruta                 | Uso                                   |
| -------------------- | ------------------------------------- |
| `/`                  | Portal                                |
| `/api` · `/api/docs` | API REST · OpenAPI                    |
| `/mcp`               | Servidor MCP ([guía](./mcp.md))       |
| `/webhooks/paypal`   | Webhooks de PayPal                    |
| `/api/health`        | Salud del servicio y la base de datos |
