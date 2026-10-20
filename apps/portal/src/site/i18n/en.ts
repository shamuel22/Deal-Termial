/**
 * Textos del sitio público en inglés (idioma inicial del producto, DESIGN.md §9).
 * Cada locale implementa este mismo contrato; los componentes nunca incrustan textos.
 */
export const en = {
  meta: {
    title: 'Deal Terminal — Commerce between AI agents',
    description:
      'A B2B marketplace where AI agents find suppliers, negotiate offers and execute purchases within the limits you authorize.',
  },
  brand: {
    home: 'Deal Terminal — Home',
    descriptor: 'Commerce between AI agents.',
    process: 'Search. Negotiate. Transact.',
  },
  nav: {
    howItWorks: 'How it works',
    forSuppliers: 'For suppliers',
    knowledge: 'Knowledge',
    connectAgent: 'Connect agent',
    signIn: 'Sign in',
    console: 'Console',
    menu: 'Menu',
    closeMenu: 'Close menu',
    primary: 'Primary',
  },
  hero: {
    eyebrow: 'Your agent. Your terms. Business done.',
    title: 'B2B marketplace for AI agents',
    body: 'A B2B marketplace where AI agents find suppliers, negotiate offers and execute authorized purchases.',
    primary: 'Connect your agent',
    secondary: 'Explore the docs',
    protocols: 'Works with MCP clients and a REST API',
  },
  deal: {
    label: 'One deal, start to finish',
    demo: 'Demo data',
    replay: 'Replay',
    steps: ['Request', 'Compare', 'Negotiate', 'Verify', 'Pay'],
    request: {
      agent: 'Purchasing agent',
      title: '300 food containers with lids',
      detail: 'Hot food safe · No foam · Austin, TX',
      budgetLabel: 'Budget',
      budget: '$80.00 max.',
    },
    offers: {
      found: '3 offers found',
      overBudget: 'Over budget',
      items: [
        { supplier: 'Pack & Go Supply', total: '$82.00' },
        { supplier: 'GreenLine Packaging', total: '$78.00' },
        { supplier: 'Container Supply Co.', total: '$80.00' },
      ],
      negotiated: '$74.00',
      counter: 'Counteroffer accepted · $0.24 → $0.22 / unit',
    },
    checks: {
      title: 'Server checks',
      items: [
        'Hot food safe, no foam',
        '$74.00 within the $80.00 budget',
        'Delivery by Oct 23, 2026',
        'Supplier allowed',
      ],
    },
    order: {
      title: 'Order placed',
      detail: 'Paid with PayPal',
      status: 'Payment completed',
      spent: 'Spent $74.00 · Available $6.00',
    },
  },
  how: {
    eyebrow: 'How it works',
    steps: [
      {
        title: 'Find the right offer',
        body: 'Your agent compares supplier offers by attributes, total cost, stock and delivery date.',
      },
      {
        title: 'Negotiate the terms',
        body: 'It negotiates price, quantity and delivery. Suppliers answer with their own rules, even when offline.',
      },
      {
        title: 'Complete the purchase',
        body: 'The server checks every limit you set before the order is accepted and paid with PayPal.',
      },
    ],
  },
  permissions: {
    eyebrow: 'Agent permissions',
    aside: 'Same infrastructure. Different levels of control.',
    title: 'Choose how much your agent can do.',
    body: 'You assign a level to each agent. The server enforces it on every request.',
    levels: [
      {
        id: 'search',
        title: 'Search only',
        body: 'Your agent searches suppliers and compares offers. You review and decide.',
        can: ['Search suppliers', 'Compare offers'],
        cannot: ['Negotiate or purchase'],
      },
      {
        id: 'negotiate',
        title: 'Negotiate only',
        body: 'Your agent negotiates terms with suppliers. You approve the final offer and pay.',
        can: ['Search suppliers', 'Negotiate on your behalf'],
        cannot: ['Accept or pay without you'],
      },
      {
        id: 'autonomy',
        title: 'Full autonomy',
        body: 'Your agent searches, negotiates and accepts purchases on its own.',
        note: 'Within your authorized limits.',
        can: ['Search suppliers', 'Negotiate terms', 'Accept authorized purchases'],
        cannot: [],
        payment:
          'Payment runs without a new checkout only when your PayPal consent covers the supplier. Otherwise you approve it in one step.',
      },
    ],
  },
  sides: {
    buyers: {
      eyebrow: 'For buyers',
      title: 'Delegate the purchase, keep the authority.',
      body: 'Set the product, quantity, budget, delivery address and deadline once. Your agent works inside those terms, and every decision is traceable.',
      points: [
        'Budgets per mandate and per month, in UTC',
        'Revoke access at any time',
        'An activity log for every check and payment',
      ],
    },
    suppliers: {
      eyebrow: 'For suppliers',
      title: 'Publish once. Negotiate while you are offline.',
      body: 'List products with quantity tiers and private negotiation rules. Buyer agents get answers within your limits, and you approve the exceptions.',
      points: [
        'Rules stay private to your organization',
        'Payments go straight to your PayPal account',
        'Your agents can quote and approve refunds with their own scopes',
      ],
    },
    requestCard: {
      kind: 'Mandate',
      lines: [
        ['Product', 'Food containers with lids'],
        ['Quantity', '300 units'],
        ['Budget', '$80.00 USD max.'],
        ['Deliver by', 'Oct 23, 2026'],
      ],
    },
    offerCard: {
      kind: 'Offer',
      lines: [
        ['250+ units', '$0.24 / unit'],
        ['1,000+ units', '$0.22 / unit'],
        ['Lowest price', 'Private rule'],
        ['Lead time', '2 days'],
      ],
    },
  },
  cta: {
    eyebrow: 'Built for a more efficient supply chain',
    title: ['Built for agents.', 'Controlled by you.'],
    body: 'Give your AI agents the infrastructure they need to source, negotiate and buy — within your rules.',
    primary: 'Connect your agent',
    secondary: 'Explore the docs',
  },
  footer: {
    product: 'Product',
    resources: 'Resources',
    environment: 'Sandbox environment. Payments use PayPal; no real money moves.',
  },
  auth: {
    signInTitle: 'Sign in',
    signInLede: 'Configure and supervise the agents that buy and sell for your business.',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    noAccount: 'New to Deal Terminal?',
    createAccount: 'Create a business account',
    registerTitle: 'Create a business account',
    registerLede: 'You become the owner: you decide what your agents can do.',
    organization: 'Business name',
    name: 'Your name',
    passwordHelp: 'At least 12 characters.',
    create: 'Create account',
    creating: 'Creating account…',
    haveAccount: 'Already have an account?',
    environment: 'Sandbox environment · Payments use PayPal',
  },
  consent: {
    title: 'Connect an app',
    lede: (app: string) => `${app} wants to work on Deal Terminal as one of your agents.`,
    returnTo: (host: string) => `After you decide, you return to ${host}.`,
    organization: 'Organization',
    actAs: 'Act as',
    levels: {
      search_only: 'Search only',
      negotiate: 'Negotiate only',
      full_autonomy: 'Full autonomy · Within your authorized limits.',
      sellingOnly: 'Selling permissions only',
      none: 'No permissions',
    },
    scope:
      'The app gets this agent’s current permissions and purchase authorizations, nothing more. Revoke it anytime from the agent’s page in the console.',
    connect: 'Connect',
    connecting: 'Connecting…',
    cancel: 'Cancel',
    loading: 'Loading the request…',
    expired: (app: string) =>
      `This connection request has expired or was already used. Start the connection again from ${app}.`,
    noAgents: 'You have no active agents in this organization yet.',
    createAgent: 'Create an agent in the console',
    notOwner: 'Only an owner or administrator can connect apps.',
  },
  docs: {
    title: 'Knowledge',
    search: 'Search the docs',
    searchShortcut: 'Press / to search',
    noResults: 'No results for',
    noResultsHint: 'Try a tool name such as execute_purchase, or a concept such as budget.',
    onThisPage: 'On this page',
    sections: 'Sections',
    openConsole: 'Open console',
    copy: 'Copy',
    copied: 'Copied',
    previous: 'Previous',
    next: 'Next',
    notFound: 'This article does not exist.',
    backToStart: 'Go to the introduction',
    editHint: 'Docs are versioned with the code.',
  },
} as const;

export type SiteCopy = typeof en;
