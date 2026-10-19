import { z } from 'zod';
import { TOOLS } from './tools.js';

/** Genera docs/mcp-tools.md a partir del catálogo real de herramientas (pnpm docs:mcp). */
const SIDE = { common: 'Comunes', buyer: 'Comprador', supplier: 'Proveedor' } as const;
const lines = [
  '# Catálogo de herramientas MCP',
  '',
  '> Generado con `pnpm docs:mcp` desde `apps/server/src/mcp/tools.ts`. No editar a mano.',
  '',
];
for (const side of ['common', 'buyer', 'supplier'] as const) {
  lines.push(`## ${SIDE[side]}`, '');
  for (const tool of TOOLS.filter((t) => t.side === side)) {
    const schema = z.toJSONSchema(tool.input, { unrepresentable: 'any' }) as {
      properties?: Record<string, { description?: string }>;
      required?: string[];
    };
    lines.push(`### \`${tool.name}\` — ${tool.title}`, '', tool.description, '');
    const props = Object.entries(schema.properties ?? {});
    if (props.length > 0) {
      lines.push('| Parámetro | Obligatorio | Descripción |', '| --- | --- | --- |');
      for (const [name, prop] of props) {
        const required = schema.required?.includes(name) ? 'sí' : 'no';
        lines.push(
          `| \`${name}\` | ${required} | ${(prop.description ?? '').replace(/\|/g, '\\|')} |`,
        );
      }
      lines.push('');
    }
    lines.push(`Solo lectura: ${tool.readOnly ? 'sí' : 'no'}`, '');
  }
}
process.stdout.write(lines.join('\n'));
