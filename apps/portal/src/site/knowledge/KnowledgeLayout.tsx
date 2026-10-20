import { ArrowUpRight, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { BrandLockup } from '../components/Brand';
import { SiteFooter } from '../components/SiteFooter';
import { SiteShell } from '../components/SiteShell';
import { useFocusTrap } from '../components/useFocusTrap';
import { useCopy } from '../i18n';
import { sections } from './manifest';
import { KnowledgeSearch } from './Search';

export function KnowledgeNav({ label }: { label: string }) {
  const { pathname } = useLocation();
  return (
    <nav className="dt-kb-nav" aria-label={label}>
      {sections.map((section) => (
        <div key={section.title} className="dt-kb-nav__section">
          <p className="dt-kb-nav__title">{section.title}</p>
          <ul>
            {section.articles.map((a) => {
              const href = `/knowledge/${a.slug}`;
              return (
                <li key={a.slug}>
                  <Link to={href} aria-current={pathname === href ? 'page' : undefined}>
                    {a.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Estructura de Knowledge (DESIGN §7, §12): cabecera con buscador, navegación, artículo e índice. */
export default function KnowledgeLayout() {
  const t = useCopy();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, drawer);

  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawer(false);
        opener.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  return (
    <SiteShell title={`${t.docs.title} — Deal Terminal`} description={t.meta.description}>
      <header className="dt-header">
        <div className="dt-container dt-kb-header__inner">
          <BrandLockup small symbolOnNarrow />
          <Link to="/knowledge" className="dt-kb-header__label" style={{ textDecoration: 'none' }}>
            {t.docs.title}
          </Link>
          <div className="dt-kb-header__search">
            <KnowledgeSearch />
          </div>
          <Link to="/console" className="dt-btn dt-btn--secondary dt-btn--compact dt-hide-tablet">
            {t.docs.openConsole}
            <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
      </header>
      <div className="dt-container">
        <div className="dt-kb">
          <KnowledgeNav label={t.docs.sections} />
          <main id="main" style={{ minWidth: 0 }}>
            <div className="dt-kb-mobilebar" style={{ marginBottom: 'var(--space-6)' }}>
              <button
                ref={opener}
                type="button"
                className="dt-btn dt-btn--secondary dt-btn--compact"
                aria-expanded={drawer}
                onClick={() => setDrawer(true)}
              >
                <Menu size={18} strokeWidth={1.75} aria-hidden />
                {t.docs.sections}
              </button>
              <Link to="/console" className="dt-btn dt-btn--ghost dt-btn--compact">
                {t.docs.openConsole}
              </Link>
            </div>
            <Outlet />
          </main>
        </div>
      </div>
      {drawer && (
        <div className="dt-kb-drawer" onClick={() => setDrawer(false)}>
          <div
            ref={panel}
            className="dt-kb-drawer__panel"
            role="dialog"
            aria-modal="true"
            aria-label={t.docs.sections}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dt-kb-drawer__top">
              <BrandLockup small />
              <button
                type="button"
                className="dt-btn dt-btn--secondary dt-btn--compact"
                onClick={() => {
                  setDrawer(false);
                  opener.current?.focus();
                }}
                autoFocus
              >
                <X size={18} strokeWidth={1.75} aria-hidden />
                <span className="dt-sr-only">{t.nav.closeMenu}</span>
              </button>
            </div>
            <KnowledgeNav label={t.docs.sections} />
          </div>
        </div>
      )}
      <SiteFooter />
    </SiteShell>
  );
}
