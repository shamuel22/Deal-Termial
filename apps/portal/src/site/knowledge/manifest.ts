/**
 * Estructura de Knowledge (DESIGN §12): secciones y artículos en orden de lectura.
 * El contenido vive en Markdown versionado con el código (content/en/*.md).
 */
const raw = import.meta.glob('./content/en/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface Article {
  slug: string;
  title: string;
  summary: string;
  section: string;
  body: string;
}

const SECTIONS: Array<{ title: string; articles: Array<Omit<Article, 'section' | 'body'>> }> = [
  {
    title: 'Start here',
    articles: [
      {
        slug: 'introduction',
        title: 'Introduction',
        summary: 'What Deal Terminal is, who uses it and how a deal moves from request to payment.',
      },
      {
        slug: 'getting-started',
        title: 'Connect your first agent',
        summary:
          'Create an agent, issue its credential and connect it from an MCP client in three steps.',
      },
    ],
  },
  {
    title: 'Agent access',
    articles: [
      {
        slug: 'access-levels',
        title: 'Access levels',
        summary:
          'Search only, Negotiate only and Full autonomy: what each level allows and how the server enforces it.',
      },
      {
        slug: 'purchase-authorizations',
        title: 'Purchase authorizations and budgets',
        summary:
          'The mandate an agent buys under: product, quantity, budget, delivery, expiry and monthly limits.',
      },
      {
        slug: 'paypal-consent',
        title: 'PayPal consent',
        summary:
          'Why paying without a checkout needs a second, financial authorization — and its status today.',
      },
    ],
  },
  {
    title: 'Commerce',
    articles: [
      {
        slug: 'offers',
        title: 'Offers and catalog',
        summary:
          'Products with normalized attributes, quantity tiers and private negotiation rules.',
      },
      {
        slug: 'negotiation',
        title: 'Negotiation',
        summary:
          'Requests, quotes, counteroffers and how supplier rules answer while the supplier is offline.',
      },
      {
        slug: 'orders',
        title: 'Orders',
        summary:
          'What is verified when a quote is accepted, reservations, statuses and cancellation.',
      },
      {
        slug: 'payments',
        title: 'Payments and refunds',
        summary: 'Checkout, delegated payment, reconciliation and refunds with PayPal.',
      },
    ],
  },
  {
    title: 'Developers',
    articles: [
      {
        slug: 'mcp',
        title: 'MCP server',
        summary: 'Connect any MCP client, the recommended agent flow and how errors are reported.',
      },
      {
        slug: 'mcp-tools',
        title: 'MCP tool reference',
        summary: 'Every tool, who can use it and its key inputs.',
      },
      {
        slug: 'api',
        title: 'REST API',
        summary: 'Authentication, endpoints, idempotency and error codes.',
      },
      {
        slug: 'webhooks',
        title: 'PayPal webhooks',
        summary: 'How payment events are verified, deduplicated and reconciled.',
      },
    ],
  },
];

export const sections = SECTIONS.map((s) => ({
  title: s.title,
  articles: s.articles
    .map((a) => ({ ...a, section: s.title, body: raw[`./content/en/${a.slug}.md`] ?? '' }))
    .filter((a) => a.body.trim().length > 0),
})).filter((s) => s.articles.length > 0);

export const articles: Article[] = sections.flatMap((s) => s.articles);

export function findArticle(slug: string | undefined): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function neighbours(slug: string): { previous?: Article; next?: Article } {
  const i = articles.findIndex((a) => a.slug === slug);
  return {
    previous: i > 0 ? articles[i - 1] : undefined,
    next: i >= 0 ? articles[i + 1] : undefined,
  };
}
