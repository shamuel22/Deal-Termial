import { Link } from 'react-router';
import { useCopy } from '../i18n';

/** Logo aprobado (DESIGN §3). Nunca se redibuja: siempre el archivo de marca. */
export function BrandLockup({
  small = false,
  symbolOnNarrow = false,
}: {
  small?: boolean;
  symbolOnNarrow?: boolean;
}) {
  const t = useCopy();
  return (
    <Link
      to="/"
      className={`dt-brand${small ? ' dt-brand--small' : ''}${symbolOnNarrow ? ' dt-brand--adaptive' : ''}`}
      aria-label={t.brand.home}
    >
      <img
        className="dt-brand__logo"
        fetchPriority="high"
        src="/brand/logo-80.png"
        srcSet="/brand/logo-40.png 1x, /brand/logo-80.png 2x, /brand/logo-120.png 3x"
        width={small ? 146 : 167}
        height={small ? 28 : 32}
        alt=""
      />
      {symbolOnNarrow && (
        <img className="dt-brand__symbol" src="/brand/icon-64.png" width={30} height={30} alt="" />
      )}
    </Link>
  );
}

/** Solo el símbolo, para espacios menores de 120 px. */
export function BrandSymbol({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/brand/icon-64.png"
      srcSet="/brand/icon-32.png 1x, /brand/icon-64.png 2x, /brand/icon-128.png 4x"
      width={size}
      height={size}
      alt=""
    />
  );
}
