import { z } from 'zod';
import { TOOLS } from './tools.js';

/** Genera docs/mcp-tools.md a partir del catálogo real de herramientas (pnpm docs:mcp). */
const SIDE = { common: 'Common', buyer: 'Buyer', supplier: 'Supplier' } as const;
const lines = [
  '# MCP tool catalog',
  '',
  '> Generated with `pnpm docs:mcp` from `apps/server/src/mcp/tools.ts`. Do not edit manually.',
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
      lines.push('| Parameter | Required | Description |', '| --- | --- | --- |');
      for (const [name, prop] of props) {
        const required = schema.required?.includes(name) ? 'yes' : 'no';
        lines.push(
          `| \`${name}\` | ${required} | ${(prop.description ?? '').replace(/\|/g, '\\|')} |`,
        );
      }
      lines.push('');
    }
    lines.push(`Read only: ${tool.readOnly ? 'yes' : 'no'}`, '');
  }
}
process.stdout.write(lines.join('\n'));
