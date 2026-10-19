import { All, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { DbHandle } from '@deal/db';
import type { AgentActor, PaymentGateway } from '@deal/core';
import { Auth, CurrentAgent } from '../auth/auth.guard.js';
import { DB } from '../database.module.js';
import { PAYMENT_GATEWAY } from '../payments/payments.module.js';
import { createMcpServer } from './mcp-server.js';

/**
 * Servidor MCP por Streamable HTTP en /mcp, sin estado: cada petición se autentica con la
 * credencial del agente (Authorization: Bearer dtk_...) y se atiende con un servidor propio.
 * El agente se ejecuta fuera de la plataforma; aquí solo se exponen herramientas.
 */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(
    @Inject(DB) private readonly db: DbHandle,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  @Post()
  @Auth('agent')
  async serve(
    @CurrentAgent() agent: AgentActor,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const server = createMcpServer({ db: this.db.db, gateway: this.gateway, agent });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  /** En modo sin estado no hay flujo SSE ni sesiones que cerrar. */
  @All()
  notAllowed(@Res() res: Response): void {
    res
      .status(405)
      .set('Allow', 'POST')
      .json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Método no permitido: usa POST' },
        id: null,
      });
  }
}
