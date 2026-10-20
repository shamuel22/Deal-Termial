import { describe, expect, it } from 'vitest';
import { articles, findArticle, neighbours, sections } from './manifest';
import { extractHeadings } from './Markdown';
import { search } from './search';
import { slugify } from './slug';

describe('Knowledge', () => {
  it('carga los 13 artículos en las cuatro secciones de DESIGN §12', () => {
    expect(sections.map((s) => s.title)).toEqual([
      'Start here',
      'Agent access',
      'Commerce',
      'Developers',
    ]);
    expect(articles).toHaveLength(13);
    for (const a of articles) expect(a.body.length, a.slug).toBeGreaterThan(500);
  });

  it('los enlaces internos apuntan a artículos existentes', () => {
    for (const a of articles) {
      for (const [, slug] of a.body.matchAll(/\]\(\/knowledge\/([a-z-]+)/g)) {
        expect(findArticle(slug), `${a.slug} → ${slug}`).toBeDefined();
      }
    }
  });

  it('no incluye credenciales reales ni dominios del despliegue', () => {
    const all = articles.map((a) => a.body).join('\n');
    expect(all).not.toMatch(/dtk_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}/);
    expect(all).not.toMatch(/lucuo\.dev|EY95RKLNXCGUW/);
  });

  it('busca por nombre de herramienta, concepto y contenido', () => {
    const tool = search('execute_purchase');
    expect(tool.length).toBeGreaterThan(0);
    expect(tool.some((r) => r.href.startsWith('/knowledge/mcp'))).toBe(true);

    const budget = search('available budget');
    expect(budget[0]?.href).toMatch(/purchase-authorizations|getting-started|introduction/);

    const heading = search('expected result');
    expect(heading[0]?.href).toBe('/knowledge/getting-started#expected-result');
  });

  it('sin coincidencias devuelve una lista vacía', () => {
    expect(search('zzqqxx')).toEqual([]);
    expect(search('a')).toEqual([]);
  });

  it('anclas estables y navegación anterior/siguiente', () => {
    expect(slugify('Step 1 — Create the agent and choose its level')).toBe(
      'step-1-create-the-agent-and-choose-its-level',
    );
    expect(slugify('`get_order` & friends')).toBe('get-order-friends');
    const headings = extractHeadings(findArticle('getting-started')!.body);
    expect(headings.map((h) => h.id)).toContain('expected-result');
    expect(neighbours('introduction')).toMatchObject({
      previous: undefined,
      next: { slug: 'getting-started' },
    });
  });
});
