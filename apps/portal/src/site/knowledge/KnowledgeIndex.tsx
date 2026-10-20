import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { useCopy } from '../i18n';
import { sections } from './manifest';

/** Portada de Knowledge: mapa estructurado por secciones (no una cuadrícula de blog, DESIGN §12). */
export default function KnowledgeIndex() {
  const t = useCopy();
  return (
    <article className="dt-article">
      <p className="dt-article__breadcrumb">{t.docs.title}</p>
      <h1>Build with Deal Terminal</h1>
      <p className="dt-article__summary">
        Everything you need to connect AI agents, delegate purchases within verifiable limits, sell
        to agents and integrate through MCP or the REST API.
      </p>
      {sections.map((section) => (
        <section
          key={section.title}
          className="dt-kb-index__section"
          aria-labelledby={`s-${section.title}`}
        >
          <h2 id={`s-${section.title}`}>{section.title}</h2>
          <ul className="dt-kb-index__list">
            {section.articles.map((a) => (
              <li key={a.slug}>
                <Link to={`/knowledge/${a.slug}`}>
                  <strong>{a.title}</strong>
                  <span>{a.summary}</span>
                  <ArrowRight size={18} strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
