import { Link } from 'react-router';
import { useCopy } from '../i18n';
import { BrandLockup } from './Brand';

/** Footer (DESIGN §11.8): solo enlaces que existen; sin redes ficticias. */
export function SiteFooter() {
  const t = useCopy();
  return (
    <footer className="dt-footer">
      <div className="dt-container dt-footer__inner">
        <BrandLockup small />
        <nav aria-label="Footer">
          <Link to="/#how-it-works">{t.nav.howItWorks}</Link>
          <Link to="/#for-suppliers">{t.nav.forSuppliers}</Link>
          <Link to="/knowledge">{t.nav.knowledge}</Link>
          <Link to="/login">{t.nav.signIn}</Link>
        </nav>
        <p className="dt-footer__descriptor">{t.brand.descriptor}</p>
        <p className="dt-footer__env">{t.footer.environment}</p>
      </div>
    </footer>
  );
}
