import {
  ArrowRight,
  Building2,
  Check,
  CircleCheck,
  FileSearch,
  FileText,
  Handshake,
  Minus,
  Package,
  Receipt,
  Search,
  MessagesSquare,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect } from 'react';
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
        <h1 id="hero-title">
          {t.hero.titleLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h1>
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
      </div>
      <DealFlow />
    </section>
  );
}

/** Visual del hero (DESIGN §11.3, §16): solicitud → oferta → pedido. Ilustrativo y etiquetado como demo. */
function DealFlow() {
  const t = useCopy();
  const f = t.flow;
  return (
    <figure className="dt-flow" aria-labelledby="flow-caption">
      <figcaption id="flow-caption" className="dt-flow__meta">
        <span className="dt-eyebrow">{f.label}</span>
        <span className="dt-eyebrow">{f.demo}</span>
      </figcaption>

      <article className="dt-flow__step" aria-label={f.request.kind}>
        <div className="dt-flow__head">
          <span>{f.request.kind}</span>
          <span>{f.request.id}</span>
        </div>
        <div className="dt-flow__row">
          <span className="dt-flow__glyph">
            <Package size={22} {...LINE} />
          </span>
          <div>
            <p className="dt-flow__title">{f.request.title}</p>
            <p className="dt-flow__detail">{f.request.detail}</p>
          </div>
          <span className="dt-badge dt-badge--info dt-flow__status">
            <FileSearch size={14} {...LINE} />
            {f.request.status}
          </span>
        </div>
        <dl className="dt-flow__budget">
          <dt>{f.request.budgetLabel}</dt>
          <dd>
            ${f.request.budget}
            <small>USD</small>
          </dd>
          <p className="dt-flow__note">{f.request.budgetNote}</p>
        </dl>
      </article>

      <div className="dt-flow__connector" aria-hidden />

      <article className="dt-flow__step" aria-label={f.quote.kind}>
        <div className="dt-flow__head">
          <span>{f.quote.kind}</span>
          <span>{f.quote.id}</span>
        </div>
        <div className="dt-flow__row">
          <span className="dt-flow__glyph">
            <Building2 size={22} {...LINE} />
          </span>
          <div>
            <p className="dt-flow__title">{f.quote.supplier}</p>
            <p className="dt-flow__detail">{f.quote.supplierNote}</p>
          </div>
          <div className="dt-flow__amount">
            <strong>${f.quote.total}</strong>
            <span>USD</span>
          </div>
        </div>
        <p className="dt-flow__breakdown">{f.quote.breakdown}</p>
        <p className="dt-badge dt-badge--success dt-badge--block">
          <CircleCheck size={16} {...LINE} />
          {f.quote.check}
        </p>
      </article>

      <div className="dt-flow__connector" aria-hidden />

      <article className="dt-flow__step" aria-label={f.order.kind}>
        <div className="dt-flow__head">
          <span>{f.order.kind}</span>
          <span>{f.order.id}</span>
        </div>
        <div className="dt-flow__row">
          <span className="dt-flow__glyph">
            <Receipt size={22} {...LINE} />
          </span>
          <div>
            <p className="dt-flow__title">{f.order.payment}</p>
            <p className="dt-flow__detail">{f.order.paymentNote}</p>
          </div>
          <span className="dt-badge dt-badge--success dt-flow__status">
            <CircleCheck size={14} {...LINE} />
            {f.order.status}
          </span>
        </div>
      </article>
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
                <span className="dt-step__number" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
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
    <section className="dt-cta" data-surface="dark" aria-labelledby="cta-title">
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
