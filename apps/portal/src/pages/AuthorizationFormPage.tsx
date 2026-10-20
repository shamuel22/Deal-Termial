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
          message: 'Check quantities, budget and expiration.',
          hint: 'The maximum quantity must be at least the minimum, the budget must be positive and the expiration must be in the future.',
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
        title="New purchase authorization"
        subtitle="Define the assignment, then review the permissions you’ll grant."
        actions={<Link to="/console/authorizations">Back to purchase authorizations</Link>}
      />
      <ErrorBox error={agents.error} />
      {agents.loading && <Loading />}
      {!agents.loading && agents.data && !eligible.length && (
        <Empty>
          You need an active agent with a purchase level.{' '}
          <Link to="/console/agents">Set up agents</Link>
        </Empty>
      )}
      {eligible.length > 0 && (
        <>
          <form ref={formRef} className="card stack" onSubmit={preview} hidden={!!review}>
            <label>
              Agent
              <select name="agentId" required defaultValue="">
                <option value="" disabled>
                  Select an agent
                </option>
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ·{' '}
                    {a.access.buyerLevel === 'search_only'
                      ? 'Search only'
                      : a.access.buyerLevel === 'negotiate'
                        ? 'Negotiate only'
                        : 'Full autonomy — Within your authorized limits.'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignment in your own words
              <textarea
                name="mandate"
                rows={4}
                required
                maxLength={2000}
                placeholder="I need 300 containers with lids for hot food…"
              />
            </label>
            <p>
              Category: Food containers. Select the required conditions below. Including them only
              in the written assignment does not create an enforceable restriction.
            </p>
            <fieldset className="stack">
              <legend>Required attributes</legend>
              <Check title="Safe for hot food" name="hot_food_safe" defaultChecked />
              <Check title="With lid" name="has_lid" defaultChecked />
              <Check title="Microwave safe" name="microwave_safe" />
              <Field
                title="Minimum capacity (oz, optional)"
                name="capacity"
                type="number"
                min="0.01"
                max="256"
                step="any"
              />
              <fieldset>
                <legend>Excluded materials</legend>
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
                title="Minimum quantity (units)"
                name="quantityMin"
                type="number"
                min="1"
                step="1"
                required
              />
              <Field
                title="Maximum quantity (units)"
                name="quantityMax"
                type="number"
                min="1"
                step="1"
                required
              />
            </div>
            <MoneyField
              title="Authorized budget (USD, includes shipping and taxes)"
              name="budgetTotal"
            />
            <fieldset className="stack">
              <legend>Delivery address in the United States</legend>
              <Field
                title="Address line 1"
                name="line1"
                required
                maxLength={200}
                autoComplete="address-line1"
              />
              <div className="row">
                <Field
                  title="City"
                  name="city"
                  required
                  maxLength={100}
                  autoComplete="address-level2"
                />
                <label>
                  State
                  <select name="state" required defaultValue="">
                    <option value="" disabled>
                      Select a state
                    </option>
                    <StateOptions />
                  </select>
                </label>
                <Field
                  title="ZIP code"
                  name="postalCode"
                  required
                  pattern="[0-9]{5}(-[0-9]{4})?"
                  autoComplete="postal-code"
                />
              </div>
            </fieldset>
            <div className="row">
              <Field
                title="Deliver by"
                name="deliverBy"
                type="date"
                required
                min={new Date().toISOString().slice(0, 10)}
              />
              <Field
                title="Purchase authorization expiration (your time zone)"
                name="expiresAt"
                type="datetime-local"
                required
              />
            </div>
            <ErrorBox error={validation} />
            <button className="primary">Review</button>
          </form>
          {review && (
            <section className="card stack">
              <h2 ref={heading} tabIndex={-1}>
                Review before activating
              </h2>
              <p>
                You’re granting this assignment to{' '}
                <strong>{selected?.name ?? review.agentId}</strong>{' '}
                <Badge value={selected?.access.buyerLevel} />.
              </p>
              <TermsSummary terms={review.terms} />
              <div className="alert info">
                <p>{levelHelp[selected?.access.buyerLevel ?? 'none']}</p>
                <p>
                  The authorized budget covers all orders and pending purchase attempts for this
                  assignment. The agent cannot exceed the limits, buy outside these terms or expand
                  its own permissions.
                </p>
                <p>
                  Unchecked attributes are optional. Any eligible supplier is allowed. You are not
                  granting PayPal consent.
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
                  Back to editing
                </button>
                <button
                  className="primary"
                  disabled={create.pending || !selected}
                  onClick={() => void confirm()}
                >
                  {create.pending ? 'Activating…' : 'Confirm and activate'}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
