import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { post, put } from '../api';
import {
  Attributes,
  Check,
  Field,
  MoneyField,
  StateOptions,
  Table,
  materials,
  numberFrom,
  textFrom,
} from '../components/forms';
import { Badge, Empty, ErrorBox, Loading, Money, PageHeader } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';

interface Product {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, unknown>;
}
interface Tier {
  minQty: number;
  unitPrice: string;
}
interface Rules {
  autoRespond: boolean;
  maxDiscount: string;
  floorUnitPrice: string;
  minQtyForDiscount: number;
  minLeadTimeDays: number;
  canWaiveShipping: boolean;
  quoteValidityHours: number;
}
interface Offer {
  id: string;
  product: Product;
  status: string;
  stockAvailable: number;
  minOrderQty: number;
  maxOrderQty: number | null;
  shipRegions: string[];
  leadTimeDays: number;
  shippingFlat: string;
  taxRate: string;
  validUntil: string | null;
  priceTiers: Tier[];
  negotiationRules: Rules;
  version: number;
}
interface Conditions {
  status: string;
  stockAvailable: number;
  minOrderQty: number;
  maxOrderQty?: number;
  shipRegions: string[];
  leadTimeDays: number;
  shippingFlat: string;
  taxRate: string;
  validUntil?: string;
  priceTiers: Tier[];
  negotiationRules: Rules;
}
export default function CatalogPage() {
  const { orgPath } = useSession();
  const base = orgPath('');
  return <Catalog key={base} base={base} />;
}
function Catalog({ base }: { base: string }) {
  const offers = useResource<Offer[]>(`${base}/offers`);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const statusAction = useAction((id: string, status: string) =>
    put<Offer>(`${base}/offers/${id}/status`, { status }),
  );
  async function setStatus(offer: Offer, status: string) {
    if (
      (status === 'archived' || status === 'paused') &&
      !window.confirm(
        status === 'archived'
          ? 'Archive this offer? You won’t be able to edit or activate it again.'
          : 'Pause this offer? It will no longer be available for new operations.',
      )
    )
      return;
    setMessage('');
    if (await statusAction.run(offer.id, status)) {
      offers.reload();
      if (editing?.id === offer.id) setEditing(null);
      setMessage('Offer status updated.');
    }
  }
  return (
    <>
      <PageHeader
        title="Supplier catalog"
        subtitle="Publish containers and set negotiation limits."
      />
      <p className="alert info">
        To receive payments for your sales,{' '}
        <Link to="/console/settings/payments">connect your PayPal account</Link>.
      </p>
      {message && (
        <p className="alert ok" role="status">
          {message}
        </p>
      )}
      <ErrorBox error={offers.error} />
      <ErrorBox error={statusAction.error} />
      {offers.loading && <Loading />}
      {offers.data &&
        (offers.data.length ? (
          <section className="card">
            <Table title="Organization offers">
              <thead>
                <tr>
                  <th>SKU / product</th>
                  <th>Attributes</th>
                  <th>Status</th>
                  <th>Reported stock</th>
                  <th>Price tiers</th>
                  <th>Version</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {offers.data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.product.sku}</strong>
                      <div>{o.product.name}</div>
                    </td>
                    <td>
                      <Attributes values={o.product.attributes} />
                    </td>
                    <td>
                      <Badge value={o.status} />
                    </td>
                    <td className="num">{o.stockAvailable}</td>
                    <td>
                      {o.priceTiers.map((t) => (
                        <div key={t.minQty}>
                          From {t.minQty}: <Money value={t.unitPrice} /> / unit
                        </div>
                      ))}
                    </td>
                    <td className="num">{o.version}</td>
                    <td>
                      {o.status !== 'archived' && (
                        <div className="stack">
                          <button
                            disabled={statusAction.pending || saving}
                            onClick={() => {
                              setEditing(o);
                              setMessage('');
                            }}
                          >
                            Edit terms
                          </button>
                          {o.status !== 'active' && (
                            <button
                              disabled={statusAction.pending || saving}
                              onClick={() => void setStatus(o, 'active')}
                            >
                              Activate
                            </button>
                          )}
                          {o.status === 'active' && (
                            <button
                              disabled={statusAction.pending || saving}
                              onClick={() => void setStatus(o, 'paused')}
                            >
                              Pause
                            </button>
                          )}
                          <button
                            className="danger"
                            disabled={statusAction.pending || saving}
                            onClick={() => void setStatus(o, 'archived')}
                          >
                            Archive
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        ) : (
          <Empty>You don’t have any offers yet.</Empty>
        ))}
      <OfferForm
        key={editing ? `${editing.id}:${editing.version}` : `new:${formVersion}`}
        base={base}
        initial={editing}
        onBusy={setSaving}
        disabled={statusAction.pending}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          offers.reload();
          setEditing(null);
          setFormVersion((v) => v + 1);
          setMessage('Offer saved.');
        }}
      />
    </>
  );
}
function localDatetime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function OfferForm({
  base,
  initial,
  onSaved,
  onCancel,
  onBusy,
  disabled,
}: {
  base: string;
  initial: Offer | null;
  onSaved: () => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [createdProduct, setCreatedProduct] = useState<Product | null>(null);
  const [tiers, setTiers] = useState(() =>
    (initial?.priceTiers ?? [{ minQty: 1, unitPrice: '' }]).map((t, index) => ({
      ...t,
      key: index,
    })),
  );
  const [nextTier, setNextTier] = useState(tiers.length);
  const rules = initial?.negotiationRules;
  const product = initial?.product ?? createdProduct;
  const save = useAction(async (form: FormData) => {
    const conditions: Conditions = {
      status: textFrom(form, 'status'),
      stockAvailable: numberFrom(form, 'stockAvailable'),
      minOrderQty: numberFrom(form, 'minOrderQty'),
      ...(textFrom(form, 'maxOrderQty') ? { maxOrderQty: numberFrom(form, 'maxOrderQty') } : {}),
      shipRegions: form.getAll('shipRegions').map(String),
      leadTimeDays: numberFrom(form, 'leadTimeDays'),
      shippingFlat: textFrom(form, 'shippingFlat'),
      taxRate: textFrom(form, 'taxRate'),
      ...(textFrom(form, 'validUntil')
        ? { validUntil: new Date(textFrom(form, 'validUntil')).toISOString() }
        : {}),
      priceTiers: tiers.map((t) => ({
        minQty: numberFrom(form, `minQty-${t.key}`),
        unitPrice: textFrom(form, `unitPrice-${t.key}`),
      })),
      negotiationRules: {
        autoRespond: form.has('autoRespond'),
        maxDiscount: textFrom(form, 'maxDiscount'),
        floorUnitPrice: textFrom(form, 'floorUnitPrice'),
        minQtyForDiscount: numberFrom(form, 'minQtyForDiscount'),
        minLeadTimeDays: numberFrom(form, 'minLeadTimeDays'),
        canWaiveShipping: form.has('canWaiveShipping'),
        quoteValidityHours: numberFrom(form, 'quoteValidityHours'),
      },
    };
    if (initial) return put<Offer>(`${base}/offers/${initial.id}`, conditions);
    let p = createdProduct;
    if (!p) {
      p = await post<Product>(`${base}/products`, {
        sku: textFrom(form, 'sku'),
        name: textFrom(form, 'name'),
        category: 'food_containers',
        unit: 'unit',
        attributes: {
          material: textFrom(form, 'material'),
          capacity_oz: numberFrom(form, 'capacity_oz'),
          hot_food_safe: form.has('hot_food_safe'),
          microwave_safe: form.has('microwave_safe'),
          has_lid: form.has('has_lid'),
          pack_size: numberFrom(form, 'pack_size'),
        },
      });
      setCreatedProduct(p);
    }
    return post<Offer>(`${base}/offers`, { productId: p.id, ...conditions });
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onBusy(true);
    const result = await save.run(form);
    onBusy(false);
    if (result) onSaved();
  }
  return (
    <section className="card">
      <h2>{initial ? `Edit terms: ${initial.product.name}` : 'New offer'}</h2>
      <form className="stack" onSubmit={submit}>
        <fieldset className="stack" disabled={save.pending || disabled}>
          {product ? (
            <div>
              <p>
                Product: {product.name} · SKU {product.sku}
              </p>
              <Attributes values={product.attributes} />
              {createdProduct && (
                <p className="alert info">
                  The product has been created. Correct the terms and save again to complete its
                  offer without creating a duplicate product.
                </p>
              )}
            </div>
          ) : (
            <fieldset className="stack">
              <legend>Product: food containers</legend>
              <div className="row">
                <Field title="SKU" name="sku" required maxLength={64} />
                <Field title="Product name" name="name" required maxLength={200} />
              </div>
              <div className="row">
                <label>
                  Material
                  <select name="material" required defaultValue="">
                    <option value="" disabled>
                      Select a material
                    </option>
                    {Object.entries(materials).map(([value, title]) => (
                      <option key={value} value={value}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  title="Capacity (oz)"
                  name="capacity_oz"
                  type="number"
                  min="0.01"
                  max="256"
                  step="any"
                  required
                />
                <Field
                  title="Units per pack"
                  name="pack_size"
                  type="number"
                  min="1"
                  step="1"
                  required
                />
              </div>
              <Check title="Safe for hot food" name="hot_food_safe" />
              <Check title="Microwave safe" name="microwave_safe" />
              <Check title="With lid" name="has_lid" />
            </fieldset>
          )}
          <fieldset className="stack">
            <legend>Offer terms</legend>
            <label>
              Status when saved
              <select
                name="status"
                defaultValue={initial?.status === 'active' ? 'active' : 'draft'}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </label>
            {initial?.status === 'paused' && (
              <p className="alert warn">
                Saving changes the paused offer to the status selected above. You can keep it
                unpublished as a draft.
              </p>
            )}
            <div className="row">
              <Field
                title="Reported stock (units)"
                name="stockAvailable"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={initial?.stockAvailable}
              />
              <Field
                title="Minimum order (units)"
                name="minOrderQty"
                type="number"
                min="1"
                step="1"
                required
                defaultValue={initial?.minOrderQty ?? 1}
              />
              <Field
                title="Maximum order (optional)"
                name="maxOrderQty"
                type="number"
                min="1"
                step="1"
                defaultValue={initial?.maxOrderQty ?? ''}
              />
            </div>
            <label>
              Delivery states (select multiple)
              <select
                name="shipRegions"
                multiple
                required
                size={6}
                defaultValue={initial?.shipRegions ?? []}
              >
                <StateOptions />
              </select>
            </label>
            <p className="muted">On a computer, use Ctrl or Cmd to select multiple states.</p>
            <div className="row">
              <Field
                title="Delivery lead time (calendar days)"
                name="leadTimeDays"
                type="number"
                min="0"
                max="60"
                step="1"
                required
                defaultValue={initial?.leadTimeDays ?? 3}
              />
              <MoneyField
                title="Flat shipping (USD)"
                name="shippingFlat"
                defaultValue={initial?.shippingFlat ?? '0.00'}
              />
              <Field
                title="Tax rate (fraction: 0.0825 = 8.25%)"
                name="taxRate"
                type="text"
                inputMode="decimal"
                pattern="0([.][0-9]{1,4})?"
                required
                defaultValue={initial?.taxRate ?? '0'}
              />
              <Field
                title="Offer expiration (optional, your time zone)"
                name="validUntil"
                type="datetime-local"
                defaultValue={localDatetime(initial?.validUntil ?? null)}
              />
            </div>
            <p className="muted">
              Tax applies to net merchandise and shipping. The maximum allowed fraction is 0.25
              (25%).
            </p>
          </fieldset>
          <fieldset className="stack">
            <legend>Unit price tiers (up to 10)</legend>
            {tiers.map((t, index) => (
              <div className="row" key={t.key}>
                <Field
                  title={`Tier ${index + 1}: minimum quantity`}
                  name={`minQty-${t.key}`}
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue={t.minQty}
                />
                <MoneyField
                  title={`Tier ${index + 1}: unit price (USD)`}
                  precision={4}
                  name={`unitPrice-${t.key}`}
                  defaultValue={t.unitPrice}
                />
                <button
                  type="button"
                  disabled={tiers.length === 1}
                  onClick={() =>
                    setTiers((current) => current.filter((tier) => tier.key !== t.key))
                  }
                >
                  Remove tier {index + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={tiers.length >= 10}
              onClick={() => {
                setTiers((current) => [...current, { key: nextTier, minQty: 1, unitPrice: '' }]);
                setNextTier((n) => n + 1);
              }}
            >
              Add tier
            </button>
            <p className="muted">
              The first tier must cover the minimum order. Prices must stay the same or decrease as
              quantity increases.
            </p>
          </fieldset>
          <fieldset className="stack">
            <legend>Private negotiation rules</legend>
            <p className="alert info">
              These rules are never shown to buyers. They set negotiation limits for automatic
              responses and your agents.
            </p>
            <Check
              title="Respond automatically within these rules"
              name="autoRespond"
              defaultChecked={rules?.autoRespond ?? true}
            />
            <div className="row">
              <Field
                title="Maximum discount (fraction, up to 0.50)"
                name="maxDiscount"
                type="text"
                inputMode="decimal"
                pattern="0([.][0-9]{1,4})?"
                required
                defaultValue={rules?.maxDiscount ?? '0'}
              />
              <MoneyField
                title="Minimum unit price (USD)"
                precision={4}
                name="floorUnitPrice"
                defaultValue={rules?.floorUnitPrice ?? ''}
              />
              <Field
                title="Minimum quantity for a discount"
                name="minQtyForDiscount"
                type="number"
                min="1"
                step="1"
                required
                defaultValue={rules?.minQtyForDiscount ?? 1}
              />
              <Field
                title="Minimum negotiable lead time (days)"
                name="minLeadTimeDays"
                type="number"
                min="0"
                max="60"
                step="1"
                required
                defaultValue={rules?.minLeadTimeDays ?? 0}
              />
              <Field
                title="Quote validity (hours)"
                name="quoteValidityHours"
                type="number"
                min="1"
                max="720"
                step="1"
                required
                defaultValue={rules?.quoteValidityHours ?? 48}
              />
            </div>
            <Check
              title="Can waive shipping"
              name="canWaiveShipping"
              defaultChecked={rules?.canWaiveShipping ?? false}
            />
          </fieldset>
          <ErrorBox error={save.error} />
          <div className="actions">
            <button className="primary">
              {save.pending
                ? 'Saving…'
                : initial
                  ? 'Save terms and selected status'
                  : 'Create offer'}
            </button>
            {initial && (
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
