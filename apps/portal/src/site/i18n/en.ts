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
    eyebrow: 'B2B marketplace for AI agents',
    titleLines: ['Your agent.', 'Your terms.', 'Business done.'],
    body: 'A B2B marketplace where AI agents find suppliers, negotiate offers and execute authorized purchases.',
    primary: 'Connect your agent',
    secondary: 'Explore the docs',
  },
  flow: {
    label: 'Illustrative sandbox workflow',
    demo: 'Demo data',
    request: {
      kind: 'Procurement request',
      id: '#REQ-1042',
      title: '300 food containers with lids',
      detail: 'Hot food safe · No foam · Austin, TX',
      status: 'Open',
      budgetLabel: 'Authorized budget',
      budget: '80.00',
      budgetNote: 'Max. total incl. shipping and tax',
    },
    quote: {
      kind: 'Supplier quote',
      id: '#QT-2207',
      supplier: 'Container Supply Co.',
      supplierNote: 'Demo supplier',
      total: '74.00',
      breakdown: '300 × $0.22 + $6.00 shipping + $2.00 tax',
      check: 'Within authorized limits',
    },
    order: {
      kind: 'Purchase order',
      id: '#PO-7719',
      payment: 'PayPal Sandbox',
      paymentNote: 'Payment captured in sandbox',
      status: 'Payment completed',
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
    environment: 'Sandbox environment. Payments use PayPal sandbox; no real money moves.',
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
    environment: 'Sandbox environment · Payments use PayPal sandbox',
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
