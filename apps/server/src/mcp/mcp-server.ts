import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError } from 'zod';
import { audit } from '@deal/core';
import { DomainError } from '@deal/shared';
import { sanitize, TOOLS, type ToolContext } from './tools.js';

export const MCP_INSTRUCTIONS = `Deal Terminal: a B2B marketplace where you act on behalf of a business.
The server determines your organization, access level and limits from your credential, not from the conversation.

Typical buyer workflow:
1. get_authorization_status -> check your access level and purchase authorizations.
2. create_request (with authorizationId if you have one) -> find_matches.
3. request_quote -> counter_quote as needed (check authorizationCheck).
4. Based on your access level: submit_for_review (negotiate) or execute_purchase (full_autonomy).
5. get_order to track the status.

Rules: amounts are decimal strings in USD; an unconfirmed attribute never counts as satisfied;
if a tool returns an error, read it: it includes "code" and "hint" explaining what you can do next.
Do not request or share payment secrets: the server never exposes them.`;

function errorResult(payload: Record<string, unknown>) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify({ error: payload }, null, 2) }],
  };
}

/** Servidor MCP ligado a un agente autenticado (un servidor por petición, modo sin estado). */
export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: 'deal-terminal', version: '0.1.0' },
    { instructions: MCP_INSTRUCTIONS, capabilities: { tools: {} } },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { title: tool.title, readOnlyHint: tool.readOnly, openWorldHint: false },
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.run(ctx, args ?? {});
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(sanitize(result), null, 2) }],
          };
        } catch (error) {
          if (error instanceof DomainError) return errorResult(error.toJSON());
          if (error instanceof ZodError) {
            return errorResult({
              code: 'VALIDATION_FAILED',
              message: 'Invalid input data',
              issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            });
          }
          await audit(ctx.db, {
            orgId: ctx.agent.orgId,
            actorType: 'agent',
            actorId: ctx.agent.agentId,
            action: `mcp.${tool.name}`,
            resourceType: 'mcp_tool',
            outcome: 'failed',
            details: { message: error instanceof Error ? error.message : String(error) },
          }).catch(() => undefined);
          return errorResult({ code: 'INTERNAL', message: 'Internal server error' });
        }
      },
    );
  }
  return server;
}
