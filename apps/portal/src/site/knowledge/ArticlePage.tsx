import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useCopy } from '../i18n';
import { findArticle, neighbours } from './manifest';
import { extractHeadings, Markdown, type Heading } from './Markdown';

function useActiveHeading(headings: Heading[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -65% 0px' },
    );
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);
  return active;
}

function Toc({ headings, active }: { headings: Heading[]; active: string | null }) {
  return (
    <ul>
      {headings.map((h) => (
        <li key={h.id} className={h.depth === 3 ? 'dt-toc-3' : undefined}>
          <a
            href={`#${h.id}`}
            data-active={active === h.id}
            aria-current={active === h.id ? 'location' : undefined}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function ArticlePage() {
  const t = useCopy();
  const { slug } = useParams();
  const { hash } = useLocation();
  const article = findArticle(slug);
  const headings = useMemo(() => (article ? extractHeadings(article.body) : []), [article]);
  const active = useActiveHeading(headings);

  useEffect(() => {
    if (article) document.title = `${article.title} — ${t.docs.title} — Deal Terminal`;
  }, [article, t.docs.title]);

  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [slug, hash]);

  if (!article) {
    return (
      <article className="dt-article">
        <h1>{t.docs.notFound}</h1>
        <p className="dt-article__summary">
          <Link to="/knowledge/introduction">{t.docs.backToStart}</Link>
        </p>
      </article>
    );
  }

  const { previous, next } = neighbours(article.slug);

  return (
    <div className="dt-kb-page">
      <article className="dt-article" aria-labelledby="article-title">
        <p className="dt-article__breadcrumb">{article.section}</p>
        <h1 id="article-title">{article.title}</h1>
        <p className="dt-article__summary">{article.summary}</p>
        {headings.length > 0 && (
          <details className="dt-kb-onpage">
            <summary>{t.docs.onThisPage}</summary>
            <Toc headings={headings} active={active} />
          </details>
        )}
        <Markdown source={article.body} />
        <nav className="dt-pager" aria-label="Article navigation">
          {previous && (
            <Link to={`/knowledge/${previous.slug}`}>
              <span>{t.docs.previous}</span>
              <strong>{previous.title}</strong>
            </Link>
          )}
          {next && (
            <Link to={`/knowledge/${next.slug}`} className="dt-pager__next">
              <span>{t.docs.next}</span>
              <strong>{next.title}</strong>
            </Link>
          )}
        </nav>
      </article>
      {headings.length > 0 && (
        <aside className="dt-kb-toc" aria-label={t.docs.onThisPage}>
          <p className="dt-kb-nav__title">{t.docs.onThisPage}</p>
          <Toc headings={headings} active={active} />
        </aside>
      )}
    </div>
  );
}
