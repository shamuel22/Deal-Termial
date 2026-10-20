import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  CircleCheck,
  FileText,
  Handshake,
  Minus,
  Receipt,
  RotateCcw,
  Search,
  MessagesSquare,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { MarketingHeader } from '../components/MarketingHeader';
import { SiteFooter } from '../components/SiteFooter';
import { SiteShell } from '../components/SiteShell';
import { useCopy } from '../i18n';

const LINE = { strokeWidth: 1.75, 'aria-hidden': true } as const;

export default function LandingPage() {
  const t = useCopy();
  const location = useLocation();

  // Los enlaces /#seccion llevan a su sección (el router no desplaza por sí solo).
  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [location.hash]);

  return (
    <SiteShell title={t.meta.title} description={t.meta.description}>
      <MarketingHeader />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Permissions />
        <Sides />
        <FinalCta />
      </main>
      <SiteFooter />
    </SiteShell>
  );
}

function Hero() {
  const t = useCopy();
  return (
    <section className="dt-container dt-hero" aria-labelledby="hero-title">
      <div className="dt-hero__copy">
        <p className="dt-eyebrow">{t.hero.eyebrow}</p>
        <h1 id="hero-title">{t.hero.title}</h1>
        <p className="dt-hero__body">{t.hero.body}</p>
        <div className="dt-hero__actions">
          <Link to="/register" className="dt-btn dt-btn--primary">
            {t.hero.primary}
            <ArrowRight size={18} {...LINE} />
          </Link>
          <Link to="/knowledge" className="dt-btn dt-btn--secondary">
            <FileText size={18} {...LINE} />
            {t.hero.secondary}
          </Link>
        </div>
        <p className="dt-hero__protocols">{t.hero.protocols}</p>
      </div>
      <DealRun />
    </section>
  );
}

// Momento de cada etapa (ms): encargo → ofertas → negociación → comprobaciones → pago.
const STAGE_AT = [0, 700, 1900, 3000, 4200] as const;
const LAST_STAGE = STAGE_AT.length - 1;

/** Reproduce la secuencia una vez; con movimiento reducido muestra directamente el resultado. */
function useDealStages(): [number, () => void] {
  const [stage, setStage] = useState(0);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStage(LAST_STAGE);
      return;
    }
    setStage(0);
    const timers = STAGE_AT.slice(1).map((at, i) => window.setTimeout(() => setStage(i + 1), at));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [run]);
  return [stage, () => setRun((n) => n + 1)];
}

/**
 * Visual del hero (DESIGN §8, §11, §16): un acuerdo completo que se explica solo.
 * El primer fotograma ya muestra el encargo y su presupuesto; el resto se revela en orden.
 */
function DealRun() {
  const t = useCopy();
  const d = t.deal;
  const [stage, replay] = useDealStages();
  const at = (n: number) => ({ 'data-on': stage >= n ? '' : undefined });

  return (
    <figure className="dt-deal" data-stage={stage} aria-labelledby="deal-caption">
      <figcaption id="deal-caption" className="dt-deal__meta">
        <span className="dt-eyebrow">{d.label}</span>
        <span className="dt-deal__meta-end">
          <span className="dt-eyebrow">{d.demo}</span>
          <button
            type="button"
            className="dt-deal__replay"
            onClick={replay}
            data-visible={stage === LAST_STAGE ? '' : undefined}
            aria-hidden={stage < LAST_STAGE}
            tabIndex={stage < LAST_STAGE ? -1 : undefined}
          >
            <RotateCcw size={14} {...LINE} />
            {d.replay}
          </button>
        </span>
      </figcaption>

      <ol className="dt-deal__rail">
        {d.steps.map((step, i) => (
          <li key={step} {...at(i)} aria-current={stage === i ? 'step' : undefined}>
            {step}
          </li>
        ))}
      </ol>

      <div className="dt-deal__card dt-deal__request">
        <span className="dt-deal__glyph">
          <Bot size={20} {...LINE} />
        </span>
        <div>
          <p className="dt-deal__kicker">{d.request.agent}</p>
          <p className="dt-deal__title">{d.request.title}</p>
          <p className="dt-deal__detail">{d.request.detail}</p>
        </div>
        <div className="dt-deal__budget">
          <span>{d.request.budgetLabel}</span>
          <strong>{d.request.budget}</strong>
        </div>
      </div>

      <div className="dt-deal__card dt-deal__offers" {...at(1)}>
        <p className="dt-deal__kicker">{d.offers.found}</p>
        <ul>
          {d.offers.items.map((offer, i) => {
            const chosen = i === d.offers.items.length - 1;
            return (
              <li
                key={offer.supplier}
                className={chosen ? 'dt-deal__offer dt-deal__offer--chosen' : 'dt-deal__offer'}
                {...(chosen ? at(2) : {})}
              >
                <Building2 size={16} {...LINE} />
                <span className="dt-deal__supplier">
                  <span>{offer.supplier}</span>
                  {i === 0 && (
                    <span className="dt-badge dt-badge--warning">
                      <TriangleAlert size={13} {...LINE} />
                      {d.offers.overBudget}
                    </span>
                  )}
                </span>
                <span className="dt-deal__price">
                  <span className="dt-deal__was">{offer.total}</span>
                  {chosen && <span className="dt-deal__now">{d.offers.negotiated}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="dt-deal__counter" {...at(2)}>
          <Handshake size={15} {...LINE} />
          {d.offers.counter}
        </p>
      </div>

      <div className="dt-deal__card dt-deal__checks" {...at(3)}>
        <p className="dt-deal__kicker">{d.checks.title}</p>
        <ul>
          {d.checks.items.map((item) => (
            <li key={item}>
              <Check size={15} {...LINE} />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="dt-deal__card dt-deal__order" {...at(4)}>
        <span className="dt-deal__glyph">
          <Receipt size={20} {...LINE} />
        </span>
        <div>
          <p className="dt-deal__title">
            {d.order.title} · {d.offers.negotiated}
          </p>
          <p className="dt-deal__detail">{d.order.detail}</p>
        </div>
        <span className="dt-badge dt-badge--success">
          <CircleCheck size={14} {...LINE} />
          {d.order.status}
        </span>
        <div className="dt-deal__meter" aria-label={d.order.spent}>
          <span />
        </div>
        <p className="dt-deal__spent">{d.order.spent}</p>
      </div>
    </figure>
  );
}

const STEP_ICONS: LucideIcon[] = [Search, Handshake, Receipt];

function HowItWorks() {
  const t = useCopy();
  return (
    <section id="how-it-works" className="dt-section" aria-labelledby="how-title">
      <div className="dt-container">
        <h2 id="how-title" className="dt-eyebrow" style={{ marginBottom: 'var(--space-10)' }}>
          {t.how.eyebrow}
        </h2>
        <ol className="dt-steps">
          {t.how.steps.map((step, i) => {
            const Icon = STEP_ICONS[i]!;
            return (
              <li key={step.title} className="dt-step">
                <div>
                  <Icon className="dt-step__icon" size={44} strokeWidth={1.5} aria-hidden />
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

const LEVEL_ICONS: Record<string, LucideIcon> = {
  search: Search,
  negotiate: MessagesSquare,
  autonomy: Zap,
};

function Permissions() {
  const t = useCopy();
  const p = t.permissions;
  return (
    <section className="dt-section" aria-labelledby="permissions-title">
      <div className="dt-container">
        <div className="dt-section__head">
          <div>
            <p className="dt-eyebrow">{p.eyebrow}</p>
            <h2 id="permissions-title">{p.title}</h2>
            <p className="dt-section__lede">{p.body}</p>
          </div>
          <p className="dt-eyebrow">{p.aside}</p>
        </div>
        <ul className="dt-levels" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {p.levels.map((level) => {
            const Icon = LEVEL_ICONS[level.id]!;
            return (
              <li key={level.id} className="dt-level">
                <div className="dt-level__top">
                  <Icon size={32} strokeWidth={1.5} aria-hidden />
                </div>
                <h3>{level.title}</h3>
                <p>{level.body}</p>
                {'note' in level && <p className="dt-level__note">{level.note}</p>}
                <ul aria-label={`${level.title}: capabilities`}>
                  {level.can.map((item) => (
                    <li key={item} className="dt-can">
                      <Check size={16} strokeWidth={2} aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                  {level.cannot.map((item) => (
                    <li key={item} className="dt-cannot">
                      <Minus size={16} strokeWidth={2} aria-hidden />
                      <span>
                        <span className="dt-sr-only">Not allowed: </span>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
                {'payment' in level && <p className="dt-level__payment">{level.payment}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Sides() {
  const t = useCopy();
  const s = t.sides;
  return (
    <section className="dt-section" aria-label={`${s.buyers.eyebrow} / ${s.suppliers.eyebrow}`}>
      <div className="dt-container dt-sides">
        <Side
          id="for-buyers"
          eyebrow={s.buyers.eyebrow}
          title={s.buyers.title}
          body={s.buyers.body}
          points={s.buyers.points}
          card={s.requestCard}
          icon={FileText}
        />
        <Side
          id="for-suppliers"
          eyebrow={s.suppliers.eyebrow}
          title={s.suppliers.title}
          body={s.suppliers.body}
          points={s.suppliers.points}
          card={s.offerCard}
          icon={Building2}
        />
      </div>
    </section>
  );
}

function Side(props: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: readonly string[];
  card: { kind: string; lines: readonly (readonly [string, string])[] };
  icon: LucideIcon;
}) {
  const Icon = props.icon;
  return (
    <article id={props.id} className="dt-side" aria-labelledby={`${props.id}-title`}>
      <p className="dt-eyebrow">{props.eyebrow}</p>
      <h3 id={`${props.id}-title`}>{props.title}</h3>
      <p>{props.body}</p>
      <ul>
        {props.points.map((point) => (
          <li key={point}>
            <Check size={16} strokeWidth={2} aria-hidden />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <div className="dt-doc">
        <p className="dt-doc__kind">
          <Icon size={18} {...LINE} />
          <span className="dt-eyebrow">{props.card.kind}</span>
        </p>
        <dl>
          {props.card.lines.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}

function FinalCta() {
  const t = useCopy();
  return (
    <section className="dt-cta" aria-labelledby="cta-title">
      <div className="dt-container dt-cta__inner">
        <div>
          <p className="dt-eyebrow">{t.cta.eyebrow}</p>
          <h2 id="cta-title">
            {t.cta.title.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
          <p>{t.cta.body}</p>
        </div>
        <div className="dt-cta__actions">
          <Link to="/register" className="dt-btn dt-btn--accent">
            {t.cta.primary}
            <ArrowRight size={18} {...LINE} />
          </Link>
          <Link to="/knowledge" className="dt-cta__link">
            <FileText size={18} {...LINE} />
            {t.cta.secondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
