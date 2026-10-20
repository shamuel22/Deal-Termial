import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Badge, Money, formatDate } from './ui';

export type BuyerLevel = 'search_only' | 'negotiate' | 'full_autonomy';
export const scopes = {
  publish_offers: 'Publish and edit offers',
  submit_quotes: 'Submit quotes and negotiate sales',
  accept_terms: 'Accept sales terms',
  approve_refunds: 'Approve refunds',
};
export type SellerScope = keyof typeof scopes;
export interface Access {
  buyerLevel: BuyerLevel | null;
  sellerScopes: SellerScope[];
}
export interface Agent {
  id: string;
  name: string;
  description: string | null;
  disabledAt: string | null;
  access: Access & { version: number; grantedAt: string; grantedByUserId: string };
  credentials: {
    id: string;
    keyPrefix: string;
    label: string | null;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }[];
}
export interface Budget {
  limit: string;
  reserved: string;
  consumed: string;
  available: string;
}
export type Constraints = Record<
  string,
  {
    eq?: string | number | boolean;
    in?: (string | number | boolean)[];
    not_in?: (string | number | boolean)[];
    min?: number;
    max?: number;
  }
>;
export interface Terms {
  mandate: string;
  category: string;
  requiredAttributes: Constraints;
  quantityMin: number;
  quantityMax: number;
  unit: string;
  allowedSupplierOrgIds: string[] | null;
  budgetTotal: string;
  currency: string;
  deliveryAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  deliverBy: string;
  expiresAt: string;
}
// Las propuestas guardan la entrada original: estos valores pueden omitirse y
// recibir sus valores predeterminados cuando el servidor aplique la propuesta.
export type TermsInput = Omit<
  Terms,
  'unit' | 'allowedSupplierOrgIds' | 'currency' | 'deliveryAddress'
> & {
  unit?: string;
  allowedSupplierOrgIds?: string[] | null;
  currency?: string;
  deliveryAddress: Omit<Terms['deliveryAddress'], 'country'> & { country?: string };
};
export interface Authorization {
  id: string;
  agentId: string;
  status: string;
  version: number;
  terms: Terms;
  budget: Budget;
}

export const materials: Record<string, string> = {
  paper: 'Paper',
  kraft_paper: 'Kraft paper',
  bagasse: 'Bagasse',
  pla: 'PLA',
  pp: 'Polypropylene (PP)',
  pet: 'PET',
  aluminum: 'Aluminum',
  foam_eps: 'Foam / expanded polystyrene (EPS)',
};
export const states: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};
export const levelHelp: Record<BuyerLevel | 'none', string> = {
  none: 'No purchasing: grants no buyer permissions. Choose sales permissions separately.',
  search_only:
    'Search only: can search, compare and save private purchase needs. Cannot contact suppliers, negotiate, reserve, accept or pay.',
  negotiate:
    'Negotiate only: can search and negotiate within the assignment. You review the offer, accept the agreement and pay in PayPal.',
  full_autonomy:
    'Full autonomy: Within your authorized limits. Can negotiate and accept agreements under an active purchase authorization. Payment without your involvement also requires compatible PayPal consent; currently, you complete payment through PayPal checkout.',
};

export function Field({
  title,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { title: string }) {
  return (
    <label>
      {title}
      <input {...props} />
    </label>
  );
}
export function MoneyField(
  props: InputHTMLAttributes<HTMLInputElement> & { title: string; precision?: 2 | 4 },
) {
  const { precision = 2, ...rest } = props;
  return (
    <Field
      type="text"
      inputMode="decimal"
      pattern={`[0-9]+([.][0-9]{1,${precision}})?`}
      required
      {...rest}
    />
  );
}
export function Check({
  title,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { title: string }) {
  return (
    <label className="inline">
      <input type="checkbox" {...props} />
      {title}
    </label>
  );
}
export function StateOptions() {
  return Object.entries(states).map(([value, text]) => (
    <option key={value} value={value}>
      {text} ({value})
    </option>
  ));
}
export function AccessFields({ initial }: { initial?: Access }) {
  const [level, setLevel] = useState<BuyerLevel | 'none'>(initial?.buyerLevel ?? 'none');
  return (
    <>
      <label>
        Purchase level
        <select
          name="buyerLevel"
          value={level}
          onChange={(e) => setLevel(e.target.value as BuyerLevel | 'none')}
        >
          <option value="none">No purchasing</option>
          <option value="search_only">Search only</option>
          <option value="negotiate">Negotiate only</option>
          <option value="full_autonomy">Full autonomy — Within your authorized limits.</option>
        </select>
      </label>
      <p className="muted">{levelHelp[level]}</p>
      <details>
        <summary>What each level allows</summary>
        <ul>
          {Object.entries(levelHelp).map(([key, help]) => (
            <li key={key}>{help}</li>
          ))}
        </ul>
      </details>
      <fieldset>
        <legend>Sales permissions you grant the agent</legend>
        {Object.entries(scopes).map(([value, title]) => (
          <Check
            key={value}
            title={title}
            name="sellerScopes"
            value={value}
            defaultChecked={initial?.sellerScopes.includes(value as SellerScope)}
          />
        ))}
      </fieldset>
    </>
  );
}
export function accessFrom(form: FormData): Access {
  const level = String(form.get('buyerLevel'));
  return {
    buyerLevel: level === 'none' ? null : (level as BuyerLevel),
    sellerScopes: form.getAll('sellerScopes') as SellerScope[],
  };
}
export const textFrom = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
export const numberFrom = (form: FormData, key: string) => Number(textFrom(form, key));
export function Table({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="portal-table" role="region" aria-label={title} tabIndex={0}>
      <table>
        <caption className="portal-caption">{title}</caption>
        {children}
      </table>
    </div>
  );
}
export function BudgetView({ budget }: { budget: Budget }) {
  // Solo la proporción visual se convierte a number; el dinero conserva precisión decimal.
  const cents = (value: string) => {
    const [whole = '0', decimals = ''] = value.split('.');
    return (
      BigInt(whole) * 100n +
      BigInt((decimals + '00').slice(0, 2)) * (whole.startsWith('-') ? -1n : 1n)
    );
  };
  const limit = cents(budget.limit);
  const used = cents(budget.reserved) + cents(budget.consumed);
  const ratio = limit > 0n ? Number((used * 100n) / limit) : 0;
  return (
    <div className="stack">
      <dl className="kv">
        <dt>Authorized budget</dt>
        <dd>
          <Money value={budget.limit} />
        </dd>
        <dt>Committed</dt>
        <dd>
          <Money value={budget.reserved} />
        </dd>
        <dt>Spent</dt>
        <dd>
          <Money value={budget.consumed} />
        </dd>
        <dt>Available to authorize</dt>
        <dd>
          <Money value={budget.available} />
        </dd>
      </dl>
      <progress
        max={100}
        value={Math.max(0, Math.min(100, ratio))}
        aria-label="Percentage of budget committed or spent"
      />
    </div>
  );
}
const attributeNames: Record<string, string> = {
  material: 'Material',
  hot_food_safe: 'Safe for hot food',
  has_lid: 'With lid',
  microwave_safe: 'Microwave safe',
  capacity_oz: 'Capacity (oz)',
  pack_size: 'Units per pack',
  compartments: 'Compartments',
};
function scalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return materials[String(value)] ?? String(value);
}
export function Attributes({ values }: { values: Record<string, unknown> }) {
  return (
    <ul>
      {Object.entries(values).map(([key, value]) => (
        <li key={key}>
          {attributeNames[key] ?? key}: {scalar(value)}
        </li>
      ))}
    </ul>
  );
}
export function ConstraintSummary({ values }: { values: Constraints }) {
  return Object.keys(values).length ? (
    <ul>
      {Object.entries(values).map(([key, rule]) => (
        <li key={key}>
          {attributeNames[key] ?? key}: {rule.eq !== undefined && scalar(rule.eq)}
          {rule.in && `allowed: ${rule.in.map(scalar).join(', ')}`}
          {rule.not_in && `excluded: ${rule.not_in.map(scalar).join(', ')}`}
          {rule.min !== undefined && `minimum ${rule.min} `}
          {rule.max !== undefined && `maximum ${rule.max}`}
        </li>
      ))}
    </ul>
  ) : (
    <p>No attribute restrictions.</p>
  );
}
export function TermsSummary({ terms }: { terms: TermsInput }) {
  const a = terms.deliveryAddress;
  return (
    <div className="stack">
      <p>{terms.mandate}</p>
      <dl className="kv">
        <dt>Category</dt>
        <dd>{terms.category === 'food_containers' ? 'Food containers' : terms.category}</dd>
        <dt>Quantity</dt>
        <dd>
          {terms.quantityMin}–{terms.quantityMax}{' '}
          {!terms.unit || terms.unit === 'unit' ? 'units' : terms.unit}
        </dd>
        <dt>Authorized budget</dt>
        <dd>
          <Money value={terms.budgetTotal} currency={terms.currency} /> (shipping and taxes
          included)
        </dd>
        <dt>Allowed suppliers</dt>
        <dd>{terms.allowedSupplierOrgIds?.join(', ') ?? 'Any eligible supplier'}</dd>
        <dt>Address</dt>
        <dd>
          {a.line1}
          {a.line2 && `, ${a.line2}`}, {a.city}, {states[a.state] ?? a.state}, {a.postalCode},
          United States
        </dd>
        <dt>Deliver by</dt>
        <dd>{formatDate(terms.deliverBy)}</dd>
        <dt>Expiration</dt>
        <dd>{formatDate(terms.expiresAt, true)} (your time zone)</dd>
      </dl>
      <ConstraintSummary values={terms.requiredAttributes} />
    </div>
  );
}
export function RequestStatus({ status }: { status: string }) {
  return status === 'approved' ? (
    <span className="badge ok">Approved</span>
  ) : (
    <Badge value={status} />
  );
}
