import { catalogSections, type ArticleMetadata } from './catalog';

/**
 * Estructura de Knowledge (DESIGN §12): secciones y artículos en orden de lectura.
 * El contenido vive en Markdown versionado con el código (content/en/*.md).
 */
const raw = import.meta.glob('./content/en/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface Article extends ArticleMetadata {
  section: string;
  body: string;
}

export const sections = catalogSections
  .map((s) => ({
    title: s.title,
    articles: s.articles
      .map((a) => ({ ...a, section: s.title, body: raw[`./content/en/${a.slug}.md`] ?? '' }))
      .filter((a) => a.body.trim().length > 0),
  }))
  .filter((s) => s.articles.length > 0);

export const articles: Article[] = sections.flatMap((s) => s.articles);

export function findArticle(slug: string | undefined): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function neighbours(slug: string): { previous?: Article; next?: Article } {
  const i = articles.findIndex((a) => a.slug === slug);
  return {
    previous: i > 0 ? articles[i - 1] : undefined,
    next: i >= 0 ? articles[i + 1] : undefined,
  };
}
