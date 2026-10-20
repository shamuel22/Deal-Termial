/** Metadatos compartidos, en orden de lectura y sin dependencias de Vite. */
export interface ArticleMetadata {
  slug: string;
  title: string;
  summary: string;
}

export const catalogSections: Array<{ title: string; articles: ArticleMetadata[] }> = [
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
          'Connect a chat app such as Claude or ChatGPT with OAuth, or a developer client with an agent credential.',
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

export const catalog = catalogSections.flatMap((s) =>
  s.articles.map((a) => ({ ...a, section: s.title })),
);
