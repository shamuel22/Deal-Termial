import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AppConfig } from '@deal/shared';
import { marked } from 'marked';
import { APP_CONFIG } from '../config.module.js';

export const PORTAL_DIST = Symbol('PORTAL_DIST');
const PLACEHOLDER = 'https://your-domain.example';
const HEADER = `# Deal Terminal

> Deal Terminal is a B2B marketplace where AI agents find suppliers, negotiate offers and execute purchases within limits a business owner authorizes. Agents connect over MCP or REST; payments run through PayPal (sandbox).

## How to connect an agent

Connect to ${PLACEHOLDER}/mcp using Streamable HTTP: stateless JSON-RPC over POST. Chat apps with custom connectors (Claude, ChatGPT) authenticate with OAuth 2.1: add ${PLACEHOLDER}/mcp as a connector, and the business owner signs in and chooses which agent the app acts as. Developer clients send an agent credential as \`Authorization: Bearer dtk_…\`, issued by the owner in the [console](${PLACEHOLDER}/console/agents). Either way, the agent's access level and purchase authorizations set what it can do. The REST API is at ${PLACEHOLDER}/api, with [OpenAPI](${PLACEHOLDER}/api/docs). Create the owner account at ${PLACEHOLDER}/register. Read [MCP server](${PLACEHOLDER}/knowledge/mcp.md) and [Connect your first agent](${PLACEHOLDER}/knowledge/getting-started.md) first.`;

interface CatalogArticle {
  slug: string;
  title: string;
  summary: string;
  section: string;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!;
  });
}

@Injectable()
export class DocsService {
  private readonly base: string;
  private readonly files = new Map<string, { mtimeMs: number; content: Promise<string> }>();

  constructor(
    @Inject(PORTAL_DIST) private readonly portalDist: string,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.base = config.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }

  /**
   * Lee del build del portal con caché por fecha de modificación: tras recompilar sin reiniciar, se
   * sirve el index.html nuevo (con los nombres de assets nuevos) y no uno obsoleto.
   */
  private async read(path: string): Promise<string> {
    const file = join(this.portalDist, path);
    let mtimeMs: number;
    try {
      mtimeMs = (await stat(file)).mtimeMs;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new NotFoundException('Documentation build not found');
      }
      throw error;
    }
    const cached = this.files.get(path);
    if (cached?.mtimeMs === mtimeMs) return cached.content;
    const content = readFile(file, 'utf8');
    this.files.set(path, { mtimeMs, content });
    content.catch(() => this.files.delete(path));
    return content;
  }

  private async catalog(): Promise<CatalogArticle[]> {
    return JSON.parse(await this.read('llms/catalog.json')) as CatalogArticle[];
  }

  private substitute(text: string): string {
    return text.replaceAll(PLACEHOLDER, this.base);
  }

  private articleMarkdown(article: CatalogArticle): Promise<string> {
    // La ruta procede únicamente del catálogo generado, nunca del parámetro HTTP.
    return this.read(`llms/knowledge/${article.slug}.md`);
  }

  private async findArticle(slug: string): Promise<CatalogArticle | undefined> {
    return (await this.catalog()).find((article) => article.slug === slug);
  }

  async markdown(slug: string): Promise<string> {
    const article = await this.findArticle(slug);
    if (!article) throw new NotFoundException('Article not found');
    return this.substitute(await this.articleMarkdown(article));
  }

  private sections(catalog: CatalogArticle[]): Map<string, CatalogArticle[]> {
    const sections = new Map<string, CatalogArticle[]>();
    for (const article of catalog) {
      const articles = sections.get(article.section) ?? [];
      articles.push(article);
      sections.set(article.section, articles);
    }
    return sections;
  }

  async llmsIndex(): Promise<string> {
    const sections = [...this.sections(await this.catalog())].map(([title, articles]) => {
      return `## ${title}\n\n${articles
        .map((a) => `- [${a.title}](${this.base}/knowledge/${a.slug}.md): ${a.summary}`)
        .join('\n')}`;
    });
    return this.substitute(
      [
        HEADER,
        ...sections,
        `## Optional\n\n- [Full documentation in one file](${this.base}/llms-full.txt)`,
      ].join('\n\n') + '\n',
    );
  }

  async llmsFull(): Promise<string> {
    const articles = await Promise.all((await this.catalog()).map((a) => this.articleMarkdown(a)));
    return this.substitute(`${HEADER}\n\n${articles.join('\n\n---\n\n')}`);
  }

  /** Solo el Markdown versionado se interpreta como HTML; la URL se inserta escapada. */
  private renderMarkdown(markdown: string): string {
    return marked.parse(markdown, { async: false }).replaceAll(PLACEHOLDER, escapeHtml(this.base));
  }

  async html(page: 'home' | 'knowledge' | 'article', slug?: string): Promise<string> {
    let index = await this.read('index.html');
    const article = page === 'article' ? await this.findArticle(slug ?? '') : undefined;
    // Los slugs desconocidos conservan el mismo shell y la página 404 de React.
    if (page === 'article' && !article) return index;

    let head = '<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt">';
    head += '<style>#dt-static{display:none}</style>';
    let content: string;
    if (article) {
      const title = escapeHtml(this.substitute(article.title));
      const summary = escapeHtml(this.substitute(article.summary));
      head += `<link rel="alternate" type="text/markdown" href="/knowledge/${escapeHtml(article.slug)}.md">`;
      index = index
        .replace(/<title>[^]*?<\/title>/i, () => `<title>${title} — Deal Terminal</title>`)
        .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/i, () => {
          return `<meta name="description" content="${summary}">`;
        });
      content = this.renderMarkdown(await this.articleMarkdown(article));
    } else if (page === 'knowledge') {
      content = '<h1>Knowledge</h1>';
      for (const [title, articles] of this.sections(await this.catalog())) {
        content += `<section><h2>${escapeHtml(this.substitute(title))}</h2><ul>`;
        content += articles
          .map((a) => {
            return `<li><a href="/knowledge/${escapeHtml(a.slug)}">${escapeHtml(this.substitute(a.title))}</a>: ${escapeHtml(this.substitute(a.summary))}</li>`;
          })
          .join('');
        content += '</ul></section>';
      }
    } else {
      content = this.renderMarkdown(HEADER);
      content += '<p><a href="/llms.txt">llms.txt</a> · <a href="/knowledge">Knowledge</a></p>';
    }

    return index
      .replace('</head>', () => `${head}</head>`)
      .replace('<div id="root"></div>', () => {
        return `<div id="root"></div><article id="dt-static">${content}</article>`;
      });
  }
}
