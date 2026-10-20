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
          ? '¿Archivar esta oferta? No podrás volver a modificarla ni activarla.'
          : '¿Pausar esta oferta? Dejará de estar disponible para nuevas operaciones.',
      )
    )
      return;
    setMessage('');
    if (await statusAction.run(offer.id, status)) {
      offers.reload();
      if (editing?.id === offer.id) setEditing(null);
      setMessage('Estado de la oferta actualizado.');
    }
  }
  return (
    <>
      <PageHeader
        title="Catálogo del proveedor"
        subtitle="Publica envases y fija los límites dentro de los que se podrá negociar."
      />
      <p className="alert info">
        Para poder cobrar tus ventas,{' '}
        <Link to="/console/settings/payments">conecta tu cuenta PayPal</Link>.
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
            <Table title="Ofertas de tu empresa">
              <thead>
                <tr>
                  <th>SKU / producto</th>
                  <th>Atributos</th>
                  <th>Estado</th>
                  <th>Stock informado</th>
                  <th>Tramos de precio</th>
                  <th>Versión</th>
                  <th>Acciones</th>
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
                          Desde {t.minQty}: <Money value={t.unitPrice} /> / unidad
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
                            Editar condiciones
                          </button>
                          {o.status !== 'active' && (
                            <button
                              disabled={statusAction.pending || saving}
                              onClick={() => void setStatus(o, 'active')}
                            >
                              Activar
                            </button>
                          )}
                          {o.status === 'active' && (
                            <button
                              disabled={statusAction.pending || saving}
                              onClick={() => void setStatus(o, 'paused')}
                            >
                              Pausar
                            </button>
                          )}
                          <button
                            className="danger"
                            disabled={statusAction.pending || saving}
                            onClick={() => void setStatus(o, 'archived')}
                          >
                            Archivar
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
          <Empty>Aún no tienes ofertas.</Empty>
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
          setMessage('Oferta guardada.');
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
      <h2>{initial ? `Editar condiciones: ${initial.product.name}` : 'Nueva oferta'}</h2>
      <form className="stack" onSubmit={submit}>
        <fieldset className="stack" disabled={save.pending || disabled}>
          {product ? (
            <div>
              <p>
                Producto: {product.name} · SKU {product.sku}
              </p>
              <Attributes values={product.attributes} />
              {createdProduct && (
                <p className="alert info">
                  El producto ya se creó. Corrige las condiciones y vuelve a guardar para completar
                  su oferta sin duplicar el producto.
                </p>
              )}
            </div>
          ) : (
            <fieldset className="stack">
              <legend>Producto: envases para alimentos</legend>
              <div className="row">
                <Field title="SKU" name="sku" required maxLength={64} />
                <Field title="Nombre del producto" name="name" required maxLength={200} />
              </div>
              <div className="row">
                <label>
                  Material
                  <select name="material" required defaultValue="">
                    <option value="" disabled>
                      Selecciona un material
                    </option>
                    {Object.entries(materials).map(([value, title]) => (
                      <option key={value} value={value}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  title="Capacidad (oz)"
                  name="capacity_oz"
                  type="number"
                  min="0.01"
                  max="256"
                  step="any"
                  required
                />
                <Field
                  title="Unidades por paquete"
                  name="pack_size"
                  type="number"
                  min="1"
                  step="1"
                  required
                />
              </div>
              <Check title="Apto para comida caliente" name="hot_food_safe" />
              <Check title="Apto para microondas" name="microwave_safe" />
              <Check title="Con tapa" name="has_lid" />
            </fieldset>
          )}
          <fieldset className="stack">
            <legend>Condiciones de la oferta</legend>
            <label>
              Estado al guardar
              <select
                name="status"
                defaultValue={initial?.status === 'active' ? 'active' : 'draft'}
              >
                <option value="draft">Borrador</option>
                <option value="active">Activa</option>
              </select>
            </label>
            {initial?.status === 'paused' && (
              <p className="alert warn">
                Al guardar, la oferta pausada pasará al estado que elijas arriba. Puedes conservarla
                sin publicar como borrador.
              </p>
            )}
            <div className="row">
              <Field
                title="Stock informado (unidades)"
                name="stockAvailable"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={initial?.stockAvailable}
              />
              <Field
                title="Pedido mínimo (unidades)"
                name="minOrderQty"
                type="number"
                min="1"
                step="1"
                required
                defaultValue={initial?.minOrderQty ?? 1}
              />
              <Field
                title="Pedido máximo (opcional)"
                name="maxOrderQty"
                type="number"
                min="1"
                step="1"
                defaultValue={initial?.maxOrderQty ?? ''}
              />
            </div>
            <label>
              Estados de entrega (selección múltiple)
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
            <p className="muted">En computadora, usa Ctrl o Cmd para seleccionar varios estados.</p>
            <div className="row">
              <Field
                title="Plazo de entrega (días naturales)"
                name="leadTimeDays"
                type="number"
                min="0"
                max="60"
                step="1"
                required
                defaultValue={initial?.leadTimeDays ?? 3}
              />
              <MoneyField
                title="Envío fijo (USD)"
                name="shippingFlat"
                defaultValue={initial?.shippingFlat ?? '0.00'}
              />
              <Field
                title="Impuesto (fracción: 0.0825 = 8.25 %)"
                name="taxRate"
                type="text"
                inputMode="decimal"
                pattern="0([.][0-9]{1,4})?"
                required
                defaultValue={initial?.taxRate ?? '0'}
              />
              <Field
                title="Vigencia de la oferta (opcional, tu zona horaria)"
                name="validUntil"
                type="datetime-local"
                defaultValue={localDatetime(initial?.validUntil ?? null)}
              />
            </div>
            <p className="muted">
              El impuesto se aplica sobre mercancía neta y transporte. La fracción máxima admitida
              es 0.25 (25 %).
            </p>
          </fieldset>
          <fieldset className="stack">
            <legend>Tramos de precio por unidad (hasta 10)</legend>
            {tiers.map((t, index) => (
              <div className="row" key={t.key}>
                <Field
                  title={`Tramo ${index + 1}: cantidad mínima`}
                  name={`minQty-${t.key}`}
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue={t.minQty}
                />
                <MoneyField
                  title={`Tramo ${index + 1}: precio unitario (USD)`}
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
                  Quitar tramo {index + 1}
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
              Añadir tramo
            </button>
            <p className="muted">
              El primer tramo debe cubrir el pedido mínimo. Los precios deben mantenerse o bajar al
              aumentar la cantidad.
            </p>
          </fieldset>
          <fieldset className="stack">
            <legend>Reglas privadas de negociación</legend>
            <p className="alert info">
              Estas reglas nunca se muestran a compradores. Definen hasta dónde pueden negociar las
              respuestas automáticas y tus agentes.
            </p>
            <Check
              title="Responder automáticamente dentro de estas reglas"
              name="autoRespond"
              defaultChecked={rules?.autoRespond ?? true}
            />
            <div className="row">
              <Field
                title="Descuento máximo (fracción, hasta 0.50)"
                name="maxDiscount"
                type="text"
                inputMode="decimal"
                pattern="0([.][0-9]{1,4})?"
                required
                defaultValue={rules?.maxDiscount ?? '0'}
              />
              <MoneyField
                title="Precio piso por unidad (USD)"
                precision={4}
                name="floorUnitPrice"
                defaultValue={rules?.floorUnitPrice ?? ''}
              />
              <Field
                title="Cantidad mínima para descuento"
                name="minQtyForDiscount"
                type="number"
                min="1"
                step="1"
                required
                defaultValue={rules?.minQtyForDiscount ?? 1}
              />
              <Field
                title="Plazo mínimo negociable (días)"
                name="minLeadTimeDays"
                type="number"
                min="0"
                max="60"
                step="1"
                required
                defaultValue={rules?.minLeadTimeDays ?? 0}
              />
              <Field
                title="Validez de cotizaciones (horas)"
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
              title="Puede bonificar el envío"
              name="canWaiveShipping"
              defaultChecked={rules?.canWaiveShipping ?? false}
            />
          </fieldset>
          <ErrorBox error={save.error} />
          <div className="actions">
            <button className="primary">
              {save.pending
                ? 'Guardando…'
                : initial
                  ? 'Guardar condiciones y estado elegido'
                  : 'Crear oferta'}
            </button>
            {initial && (
              <button type="button" onClick={onCancel}>
                Cancelar edición
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
