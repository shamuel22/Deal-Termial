import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, post } from '../api';
import {
  Check,
  Field,
  MoneyField,
  StateOptions,
  TermsSummary,
  levelHelp,
  materials,
  numberFrom,
  textFrom,
  type Agent,
  type Authorization,
  type Constraints,
  type Terms,
} from '../components/forms';
import { Badge, Empty, ErrorBox, Loading, PageHeader } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';

interface CreateAuthorization {
  agentId: string;
  terms: Terms;
}
export default function AuthorizationFormPage() {
  const { orgPath } = useSession();
  const base = orgPath('');
  return <AuthorizationForm key={base} base={base} />;
}
function AuthorizationForm({ base }: { base: string }) {
  const navigate = useNavigate();
  const agents = useResource<Agent[]>(`${base}/agents`);
  const [review, setReview] = useState<CreateAuthorization | null>(null);
  const [validation, setValidation] = useState<ApiError | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const create = useAction((body: CreateAuthorization) =>
    post<Authorization>(`${base}/authorizations`, body),
  );
  const eligible = agents.data?.filter((a) => a.access.buyerLevel && !a.disabledAt) ?? [];
  const selected = eligible.find((a) => a.id === review?.agentId);
  function preview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidation(null);
    create.setError(null);
    const form = new FormData(e.currentTarget);
    const attributes: Constraints = {};
    for (const key of ['hot_food_safe', 'has_lid', 'microwave_safe'])
      if (form.has(key)) attributes[key] = { eq: true };
    const excluded = form.getAll('excluded').map(String);
    if (excluded.length) attributes.material = { not_in: excluded };
    if (textFrom(form, 'capacity')) attributes.capacity_oz = { min: numberFrom(form, 'capacity') };
    const quantityMin = numberFrom(form, 'quantityMin');
    const quantityMax = numberFrom(form, 'quantityMax');
    const expiry = new Date(textFrom(form, 'expiresAt'));
    if (
      quantityMax < quantityMin ||
      !Number.isFinite(expiry.getTime()) ||
      expiry.getTime() <= Date.now() ||
      !/[1-9]/.test(textFrom(form, 'budgetTotal'))
    ) {
      setValidation(
        new ApiError(0, {
          code: 'VALIDATION_FAILED',
          message: 'Revisa cantidades, presupuesto y vencimiento.',
          hint: 'La cantidad máxima debe ser mayor o igual a la mínima, el presupuesto positivo y el vencimiento futuro.',
        }),
      );
      return;
    }
    setReview({
      agentId: textFrom(form, 'agentId'),
      terms: {
        mandate: textFrom(form, 'mandate'),
        category: 'food_containers',
        requiredAttributes: attributes,
        quantityMin,
        quantityMax,
        unit: 'unit',
        allowedSupplierOrgIds: null,
        budgetTotal: textFrom(form, 'budgetTotal'),
        currency: 'USD',
        deliveryAddress: {
          line1: textFrom(form, 'line1'),
          city: textFrom(form, 'city'),
          state: textFrom(form, 'state'),
          postalCode: textFrom(form, 'postalCode'),
          country: 'US',
        },
        deliverBy: textFrom(form, 'deliverBy'),
        expiresAt: expiry.toISOString(),
      },
    });
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function confirm() {
    if (!review) return;
    if (await create.run(review)) {
      agents.reload();
      navigate('/console/authorizations');
    }
  }
  return (
    <>
      <PageHeader
        title="Nueva autorización"
        subtitle="Primero define el encargo. Después revisa exactamente qué facultades vas a conceder."
        actions={<Link to="/console/authorizations">Volver a autorizaciones</Link>}
      />
      <ErrorBox error={agents.error} />
      {agents.loading && <Loading />}
      {!agents.loading && agents.data && !eligible.length && (
        <Empty>
          Necesitas un agente activo con nivel de compra.{' '}
          <Link to="/console/agents">Configurar agentes</Link>
        </Empty>
      )}
      {eligible.length > 0 && (
        <>
          <form ref={formRef} className="card stack" onSubmit={preview} hidden={!!review}>
            <label>
              Agente
              <select name="agentId" required defaultValue="">
                <option value="" disabled>
                  Selecciona un agente
                </option>
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ·{' '}
                    {a.access.buyerLevel === 'search_only'
                      ? 'Solo búsqueda'
                      : a.access.buyerLevel === 'negotiate'
                        ? 'Solo negociación'
                        : 'Autonomía total'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Encargo en tus palabras
              <textarea
                name="mandate"
                rows={4}
                required
                maxLength={2000}
                placeholder="Necesito 300 envases con tapa para comida caliente…"
              />
            </label>
            <p>
              Categoría: Envases para alimentos. Las condiciones obligatorias son las que marcas a
              continuación; incluirlas solo en el encargo escrito no crea una restricción
              verificable.
            </p>
            <fieldset className="stack">
              <legend>Atributos obligatorios</legend>
              <Check title="Apto para comida caliente" name="hot_food_safe" defaultChecked />
              <Check title="Con tapa" name="has_lid" defaultChecked />
              <Check title="Apto para microondas" name="microwave_safe" />
              <Field
                title="Capacidad mínima (oz, opcional)"
                name="capacity"
                type="number"
                min="0.01"
                max="256"
                step="any"
              />
              <fieldset>
                <legend>Materiales excluidos</legend>
                {Object.entries(materials).map(([value, title]) => (
                  <Check
                    key={value}
                    title={title}
                    name="excluded"
                    value={value}
                    defaultChecked={value === 'foam_eps'}
                  />
                ))}
              </fieldset>
            </fieldset>
            <div className="row">
              <Field
                title="Cantidad mínima (unidades)"
                name="quantityMin"
                type="number"
                min="1"
                step="1"
                required
              />
              <Field
                title="Cantidad máxima (unidades)"
                name="quantityMax"
                type="number"
                min="1"
                step="1"
                required
              />
            </div>
            <MoneyField
              title="Presupuesto total acumulado (USD, incluye transporte e impuestos)"
              name="budgetTotal"
            />
            <fieldset className="stack">
              <legend>Dirección de entrega en Estados Unidos</legend>
              <Field
                title="Dirección, línea 1"
                name="line1"
                required
                maxLength={200}
                autoComplete="address-line1"
              />
              <div className="row">
                <Field
                  title="Ciudad"
                  name="city"
                  required
                  maxLength={100}
                  autoComplete="address-level2"
                />
                <label>
                  Estado
                  <select name="state" required defaultValue="">
                    <option value="" disabled>
                      Selecciona un estado
                    </option>
                    <StateOptions />
                  </select>
                </label>
                <Field
                  title="Código postal"
                  name="postalCode"
                  required
                  pattern="[0-9]{5}(-[0-9]{4})?"
                  autoComplete="postal-code"
                />
              </div>
            </fieldset>
            <div className="row">
              <Field
                title="Fecha límite de entrega"
                name="deliverBy"
                type="date"
                required
                min={new Date().toISOString().slice(0, 10)}
              />
              <Field
                title="Vencimiento de la autorización (tu zona horaria)"
                name="expiresAt"
                type="datetime-local"
                required
              />
            </div>
            <ErrorBox error={validation} />
            <button className="primary">Revisar</button>
          </form>
          {review && (
            <section className="card stack">
              <h2 ref={heading} tabIndex={-1}>
                Revisa antes de activar
              </h2>
              <p>
                Concedes este encargo a <strong>{selected?.name ?? review.agentId}</strong>{' '}
                <Badge value={selected?.access.buyerLevel} />.
              </p>
              <TermsSummary terms={review.terms} />
              <div className="alert info">
                <p>{levelHelp[selected?.access.buyerLevel ?? 'none']}</p>
                <p>
                  El presupuesto es un máximo acumulado entre todos los pedidos e intentos
                  pendientes de este encargo. El agente no podrá superar los límites, comprar fuera
                  de estas condiciones ni ampliar sus propios permisos.
                </p>
                <p>
                  Los atributos sin marcar no serán obligatorios. Se permite cualquier proveedor
                  compatible. No estás concediendo un consentimiento financiero de PayPal.
                </p>
              </div>
              <ErrorBox error={create.error} />
              <div className="actions">
                <button
                  disabled={create.pending}
                  onClick={() => {
                    setReview(null);
                    requestAnimationFrame(() => formRef.current?.querySelector('select')?.focus());
                  }}
                >
                  Volver a editar
                </button>
                <button
                  className="primary"
                  disabled={create.pending || !selected}
                  onClick={() => void confirm()}
                >
                  {create.pending ? 'Activando…' : 'Confirmar y activar'}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
