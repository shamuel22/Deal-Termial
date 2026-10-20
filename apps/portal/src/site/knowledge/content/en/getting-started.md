Connect an AI agent to Deal Terminal so it can search offers, and — if you allow it — negotiate and buy for your organization. It takes three steps and about five minutes.

## Requirements

- A Deal Terminal account for your organization. [Create one](/register) if you do not have it; you become its owner.
- An MCP client that supports **Streamable HTTP** and custom headers, such as Claude Code, Codex or your own application built with the official MCP SDK.
- The address of your Deal Terminal deployment. In the examples it is `https://your-domain.example`; locally it is `http://localhost:3029`.

## Step 1 — Create the agent and choose its level

In the console, open **Agents** (`/console/agents`) and connect a new agent. Give it a name and choose a buying level:

| Level           | The agent can                            | You keep                       |
| --------------- | ---------------------------------------- | ------------------------------ |
| `search_only`   | Search, compare and save requests        | Every negotiation and decision |
| `negotiate`     | Also request quotes and counteroffer     | Acceptance and payment         |
| `full_autonomy` | Also accept quotes and execute purchases | The limits you authorize       |

Start with **Search only** unless you are ready to delegate more. You can raise or lower the level at any time; it applies on the agent's next request. See [Access levels](/knowledge/access-levels).

## Step 2 — Issue its credential

Open the agent and issue a credential. It starts with `dtk_` and is shown **once**. Copy it into your client's secret storage or an environment variable.

> **Warning:** The credential identifies the agent and its organization. Treat it like a password: keep it out of prompts, chats and repositories. If it leaks, revoke it from the same screen and issue a new one.

## Step 3 — Add the MCP server to your client

The server lives at `/mcp` and reads the credential from the `Authorization` header.

### Claude Code

```bash
export DEAL_TERMINAL_KEY="dtk_your_agent_credential"
claude mcp add --transport http deal-terminal https://your-domain.example/mcp \
  --header "Authorization: Bearer ${DEAL_TERMINAL_KEY}"
```

### Codex

Add the server to `~/.codex/config.toml` and export `DEAL_TERMINAL_KEY` before starting Codex:

```toml
[mcp_servers.deal_terminal]
url = "https://your-domain.example/mcp"
bearer_token_env_var = "DEAL_TERMINAL_KEY"
```

### Your own client (TypeScript SDK)

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'my-buying-agent', version: '1.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('https://your-domain.example/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${process.env.DEAL_TERMINAL_KEY}` } },
  }),
);

const status = await client.callTool({ name: 'get_authorization_status', arguments: {} });
```

These three examples were validated against this implementation: Claude Code and Codex with real models, and the SDK in the automated test suite.

## Expected result

Ask your agent to call `get_authorization_status`. It returns its level, its purchase authorizations and whether a financial authorization exists — never a secret:

```json
{
  "agent": {
    "agentId": "<agentId>",
    "buyerLevel": "search_only",
    "sellerScopes": [],
    "accessVersion": 1
  },
  "financialAuthorization": { "active": false, "scopes": [] },
  "monthlyBudget": null,
  "authorizations": []
}
```

From here the agent can follow the flow the server describes when it connects: `create_request` → `find_matches` → `request_quote` → `counter_quote` → `submit_for_review` or `execute_purchase`. See [MCP server](/knowledge/mcp).

## Before your agent can buy

> **Important:** Buying on its own needs two things. A **purchase authorization** says what the agent may buy, how much and until when; you create it in the console under **Authorizations**. A **PayPal consent** lets payments run without a new checkout. Until both exist, an agent with full autonomy negotiates and accepts within its limits, and you complete the payment in one step. See [PayPal consent](/knowledge/paypal-consent).

## If something fails

| What you see                          | Why                                                      | What to do                                                                   |
| ------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| The client cannot connect, HTTP `401` | Missing, mistyped or revoked credential                  | Check the header; issue a new credential if it was revoked.                  |
| HTTP `405` on `/mcp`                  | The client opened a GET stream; the server is stateless  | Use the Streamable HTTP transport, which sends `POST` requests.              |
| `LEVEL_INSUFFICIENT`                  | The action needs a higher level                          | Raise the level in the console if you want to delegate it.                   |
| `AUTHORIZATION_NOT_FOUND`             | No active purchase authorization covers the purchase     | Create one, or let the agent propose it with `request_authorization_change`. |
| `BUDGET_EXCEEDED`                     | The total is above what remains of the authorized budget | Negotiate a lower total or increase the budget.                              |

Every error includes a stable `code` and a `hint`. The full list is in [REST API](/knowledge/api).
