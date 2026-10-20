import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NotFoundException } from '@nestjs/common';
import { loadConfig } from '@deal/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DocsService } from '../dist/docs/docs.service.js';

const config = loadConfig({
  PUBLIC_BASE_URL: 'https://docs.example.test/',
  DATABASE_URL: 'unused',
  PAYPAL_CLIENT_ID: 'fixture',
  PAYPAL_CLIENT_SECRET: 'fixture',
  PAYPAL_WEBHOOK_ID: 'fixture',
  PAYPAL_PARTNER_MERCHANT_ID: 'fixture',
});
let portalDist: string;
let docs: DocsService;

beforeEach(async () => {
  portalDist = await mkdtemp(join(tmpdir(), 'deal-docs-'));
  docs = new DocsService(portalDist, config);
});

afterEach(async () => {
  await rm(portalDist, { recursive: true, force: true });
});

async function buildFixture() {
  await mkdir(join(portalDist, 'llms/knowledge'), { recursive: true });
  await writeFile(
    join(portalDist, 'index.html'),
    '<html><head><title>Deal Terminal</title><meta name="description" content="Original"></head><body><div id="root"></div></body></html>',
  );
  await writeFile(
    join(portalDist, 'llms/catalog.json'),
    JSON.stringify([
      {
        slug: 'mcp',
        title: 'MCP <server>',
        summary: 'Use "credentials" & <limits>.',
        section: 'Agents & <owners>',
      },
    ]),
  );
  await writeFile(
    join(portalDist, 'llms/knowledge/mcp.md'),
    '# MCP server\n\nConnect to `https://your-domain.example/mcp`.',
  );
}

describe('documentation files', () => {
  it('returns clean 404s before the portal is built and can read a later build', async () => {
    const requests = [
      docs.llmsIndex(),
      docs.llmsFull(),
      docs.markdown('mcp'),
      docs.html('home'),
      docs.html('knowledge'),
      docs.html('article', 'mcp'),
    ];
    for (const result of await Promise.allSettled(requests)) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(NotFoundException);
        expect((result.reason as NotFoundException).getStatus()).toBe(404);
      }
    }
    await buildFixture();
    expect(await docs.llmsIndex()).toContain('https://docs.example.test/knowledge/mcp.md');
    expect(await docs.markdown('mcp')).toContain('https://docs.example.test/mcp');
  });

  it('serves a rebuilt portal without a restart (cache follows the file on disk)', async () => {
    await buildFixture();
    const before = await docs.html('article', 'mcp');
    expect(await docs.html('article', 'mcp')).toBe(before);
    // Un build nuevo cambia index.html (assets con otro hash): debe servirse el nuevo.
    const index = join(portalDist, 'index.html');
    await writeFile(
      index,
      '<html><head><title>Deal Terminal</title><meta name="description" content="Rebuilt"></head><body><div id="root"></div><script src="/assets/index-new.js"></script></body></html>',
    );
    const later = new Date(Date.now() + 5_000);
    await utimes(index, later, later);
    expect(await docs.html('article', 'mcp')).toContain('/assets/index-new.js');
    await rm(portalDist, { recursive: true });
    await expect(docs.markdown('mcp')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('escapes metadata in HTML while rendering trusted Markdown', async () => {
    await buildFixture();
    const html = await docs.html('article', 'mcp');
    expect(html).toContain('<title>MCP &lt;server&gt; — Deal Terminal</title>');
    expect(html).toContain('content="Use &quot;credentials&quot; &amp; &lt;limits&gt;."');
    expect(html).toContain('<h1>MCP server</h1>');
    expect(html).toContain('<code>https://docs.example.test/mcp</code>');
    const index = await docs.html('knowledge');
    expect(index).toContain('Agents &amp; &lt;owners&gt;');
    expect(index).toContain('MCP &lt;server&gt;');
    expect(index).toContain('Use &quot;credentials&quot; &amp; &lt;limits&gt;.');
  });
});
