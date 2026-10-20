import { useEffect, type ReactNode } from 'react';
import '../fonts';
import '../tokens.css';
import '../site.css';

/** Contenedor del sitio público: superficie marfil, enlace de salto y título del documento. */
export function SiteShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = title;
    if (description)
      document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);

  return (
    <div className="dt-site">
      <a className="dt-skip" href="#main">
        Skip to content
      </a>
      {children}
    </div>
  );
}
