import { Menu, X, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useCopy } from '../i18n';
import { BrandLockup } from './Brand';
import { useFocusTrap } from './useFocusTrap';

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** Cabecera de marketing (DESIGN §11.1, §15 MarketingHeader): navegación breve y una acción principal. */
export function MarketingHeader() {
  const t = useCopy();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useFocusTrap(panel, open);

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const links = [
    { to: '/#how-it-works', label: t.nav.howItWorks },
    { to: '/#for-suppliers', label: t.nav.forSuppliers },
    { to: '/knowledge', label: t.nav.knowledge },
  ];

  return (
    <header className="dt-header">
      <div className="dt-container dt-header__inner">
        <BrandLockup />
        <nav className="dt-header__nav" aria-label={t.nav.primary}>
          {links.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="dt-header__actions">
          <Link to="/login" className="dt-btn dt-btn--ghost dt-btn--compact dt-hide-tablet">
            {t.nav.signIn}
          </Link>
          <Link to="/register" className="dt-btn dt-btn--primary dt-btn--compact dt-hide-tablet">
            {t.nav.connectAgent}
            <ArrowRight {...ICON} />
          </Link>
          <button
            ref={toggle}
            type="button"
            className="dt-btn dt-btn--secondary dt-btn--compact dt-menu-button"
            aria-expanded={open}
            aria-controls="dt-mobile-menu"
            onClick={() => setOpen(true)}
          >
            <Menu {...ICON} />
            {t.nav.menu}
          </button>
        </div>
      </div>
      {open && (
        <div
          className="dt-mobile-menu"
          id="dt-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label={t.nav.menu}
        >
          <div className="dt-mobile-menu__top">
            <BrandLockup small />
            <button
              type="button"
              className="dt-btn dt-btn--secondary dt-btn--compact"
              onClick={() => {
                setOpen(false);
                toggle.current?.focus();
              }}
              autoFocus
            >
              <X {...ICON} />
              {t.nav.closeMenu}
            </button>
          </div>
          <nav aria-label={t.nav.primary}>
            {links.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
            <Link to="/login">{t.nav.signIn}</Link>
          </nav>
          <Link to="/register" className="dt-btn dt-btn--primary">
            {t.nav.connectAgent}
            <ArrowRight {...ICON} />
          </Link>
        </div>
      )}
    </header>
  );
}
