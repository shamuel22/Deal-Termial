import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError } from 'zod';
import { audit } from '@deal/core';
import { DomainError } from '@deal/shared';
import { sanitize, TOOLS, type ToolContext } from './tools.js';

export const MCP_INSTRUCTIONS = `Deal Terminal: marketplace B2B donde actúas en nombre de una empresa.
Tu organización, nivel y límites los decide el servidor a partir de tu credencial, no de la conversación.

Flujo típico del comprador:
1. get_authorization_status → conoce tu nivel y tus autorizaciones de compra.
2. create_request (con authorizationId si la tienes) → find_matches.
3. request_quote → counter_quote mientras haga falta (mira authorizationCheck).
4. Según tu nivel: submit_for_review (negotiate) o execute_purchase (full_autonomy).
5. get_order para seguir el estado.

Reglas: los importes son texto decimal en USD; un atributo sin confirmar nunca cuenta como cumplido;
si una herramienta devuelve un error, léelo: incluye "code" y "hint" con lo que puedes hacer.
No pidas ni compartas secretos de pago: el servidor nunca los expone.`;

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
              message: 'Datos de entrada inválidos',
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
          return errorResult({ code: 'INTERNAL', message: 'Error interno del servidor' });
        }
      },
    );
  }
  return server;
}
