import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Badge, Money, formatDate } from './ui';

export type BuyerLevel = 'search_only' | 'negotiate' | 'full_autonomy';
export const scopes = {
  publish_offers: 'Publicar y modificar ofertas',
  submit_quotes: 'Enviar cotizaciones y negociar ventas',
  accept_terms: 'Aceptar condiciones de venta',
  approve_refunds: 'Aprobar devoluciones de dinero',
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
  paper: 'Papel',
  kraft_paper: 'Papel kraft',
  bagasse: 'Bagazo',
  pla: 'PLA',
  pp: 'Polipropileno (PP)',
  pet: 'PET',
  aluminum: 'Aluminio',
  foam_eps: 'Foam / poliestireno expandido (EPS)',
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
  DC: 'Distrito de Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawái',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Luisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Misisipi',
  MO: 'Misuri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'Nuevo Hampshire',
  NJ: 'Nueva Jersey',
  NM: 'Nuevo México',
  NY: 'Nueva York',
  NC: 'Carolina del Norte',
  ND: 'Dakota del Norte',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregón',
  PA: 'Pensilvania',
  RI: 'Rhode Island',
  SC: 'Carolina del Sur',
  SD: 'Dakota del Sur',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'Virginia Occidental',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};
export const levelHelp: Record<BuyerLevel | 'none', string> = {
  none: 'Sin compras: no concede facultades de comprador. Las facultades de venta se eligen por separado.',
  search_only:
    'Solo búsqueda: puede buscar, comparar y guardar necesidades privadas. No puede contactar proveedores, negociar, reservar, aceptar ni pagar.',
  negotiate:
    'Solo negociación: puede buscar y negociar dentro del encargo. Tú revisas la propuesta, aceptas el acuerdo y pagas en PayPal.',
  full_autonomy:
    'Autonomía total: puede negociar y aceptar acuerdos dentro de una autorización vigente. Pagar sin tu intervención exige además autorización financiera compatible; actualmente el pago se completa con tu checkout PayPal.',
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
        Nivel de compra
        <select
          name="buyerLevel"
          value={level}
          onChange={(e) => setLevel(e.target.value as BuyerLevel | 'none')}
        >
          <option value="none">Sin compras</option>
          <option value="search_only">Solo búsqueda</option>
          <option value="negotiate">Solo negociación</option>
          <option value="full_autonomy">Autonomía total</option>
        </select>
      </label>
      <p className="muted">{levelHelp[level]}</p>
      <details>
        <summary>Qué permite cada nivel</summary>
        <ul>
          {Object.entries(levelHelp).map(([key, help]) => (
            <li key={key}>{help}</li>
          ))}
        </ul>
      </details>
      <fieldset>
        <legend>Facultades de venta que concedes al agente</legend>
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
        <dt>Límite</dt>
        <dd>
          <Money value={budget.limit} />
        </dd>
        <dt>Reservado</dt>
        <dd>
          <Money value={budget.reserved} />
        </dd>
        <dt>Consumido</dt>
        <dd>
          <Money value={budget.consumed} />
        </dd>
        <dt>Disponible</dt>
        <dd>
          <Money value={budget.available} />
        </dd>
      </dl>
      <progress
        max={100}
        value={Math.max(0, Math.min(100, ratio))}
        aria-label="Porcentaje de presupuesto reservado o consumido"
      />
    </div>
  );
}
const attributeNames: Record<string, string> = {
  material: 'Material',
  hot_food_safe: 'Apto para comida caliente',
  has_lid: 'Con tapa',
  microwave_safe: 'Apto para microondas',
  capacity_oz: 'Capacidad (oz)',
  pack_size: 'Unidades por paquete',
  compartments: 'Compartimentos',
};
function scalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
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
          {rule.in && `permitidos: ${rule.in.map(scalar).join(', ')}`}
          {rule.not_in && `excluidos: ${rule.not_in.map(scalar).join(', ')}`}
          {rule.min !== undefined && `mínimo ${rule.min} `}
          {rule.max !== undefined && `máximo ${rule.max}`}
        </li>
      ))}
    </ul>
  ) : (
    <p>Sin restricciones de atributos.</p>
  );
}
export function TermsSummary({ terms }: { terms: TermsInput }) {
  const a = terms.deliveryAddress;
  return (
    <div className="stack">
      <p>{terms.mandate}</p>
      <dl className="kv">
        <dt>Categoría</dt>
        <dd>{terms.category === 'food_containers' ? 'Envases para alimentos' : terms.category}</dd>
        <dt>Cantidad</dt>
        <dd>
          {terms.quantityMin}–{terms.quantityMax}{' '}
          {!terms.unit || terms.unit === 'unit' ? 'unidades' : terms.unit}
        </dd>
        <dt>Presupuesto acumulado</dt>
        <dd>
          <Money value={terms.budgetTotal} currency={terms.currency} /> (transporte e impuestos
          incluidos)
        </dd>
        <dt>Proveedores permitidos</dt>
        <dd>{terms.allowedSupplierOrgIds?.join(', ') ?? 'Cualquier proveedor compatible'}</dd>
        <dt>Dirección</dt>
        <dd>
          {a.line1}
          {a.line2 && `, ${a.line2}`}, {a.city}, {states[a.state] ?? a.state}, {a.postalCode},
          Estados Unidos
        </dd>
        <dt>Entregar a más tardar</dt>
        <dd>{formatDate(terms.deliverBy)}</dd>
        <dt>Vencimiento</dt>
        <dd>{formatDate(terms.expiresAt, true)} (tu zona horaria)</dd>
      </dl>
      <ConstraintSummary values={terms.requiredAttributes} />
    </div>
  );
}
export function RequestStatus({ status }: { status: string }) {
  return status === 'approved' ? (
    <span className="badge ok">Aprobada</span>
  ) : (
    <Badge value={status} />
  );
}
