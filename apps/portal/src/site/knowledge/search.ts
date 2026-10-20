import { marked, type Tokens } from 'marked';
import { articles } from './manifest';
import { plain } from './Markdown';
import { slugify } from './slug';

/** Una entrada del índice: un artículo o una de sus secciones. */
interface Entry {
  slug: string;
  articleTitle: string;
  section: string;
  heading: string | null;
  anchor: string | null;
  text: string;
  haystack: { title: string; heading: string; text: string };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokenText(token: Tokens.Generic): string {
  if (token.type === 'code') return (token as Tokens.Code).text;
  if (token.type === 'table') {
    const t = token as Tokens.Table;
    return [...t.header, ...t.rows.flat()].map((c) => c.text).join(' ');
  }
  if (token.type === 'list') return (token as Tokens.List).items.map((i) => i.text).join(' ');
  return 'text' in token && typeof token.text === 'string' ? token.text : '';
}

/** Índice construido una vez a partir del Markdown versionado. */
const INDEX: Entry[] = articles.flatMap((article) => {
  const entries: Entry[] = [];
  let current: Entry = {
    slug: article.slug,
    articleTitle: article.title,
    section: article.section,
    heading: null,
    anchor: null,
    text: article.summary,
    haystack: { title: '', heading: '', text: '' },
  };
  const flush = () => entries.push(current);
  for (const token of marked.lexer(article.body)) {
    if (token.type === 'heading' && (token.depth === 2 || token.depth === 3)) {
      flush();
      const heading = plain(token.text);
      current = { ...current, heading, anchor: slugify(token.text), text: '' };
    } else {
      current.text += ` ${plain(tokenText(token as Tokens.Generic))}`;
    }
  }
  flush();
  return entries.map((e) => ({
    ...e,
    text: e.text.replace(/\s+/g, ' ').trim(),
    haystack: {
      title: normalize(e.articleTitle),
      heading: normalize(e.heading ?? ''),
      text: normalize(e.text),
    },
  }));
});

export interface SearchResult {
  key: string;
  href: string;
  articleTitle: string;
  section: string;
  heading: string | null;
  snippet: string;
  terms: string[];
}

/** Búsqueda por título, encabezados y contenido; todos los términos deben aparecer. */
export function search(query: string, limit = 8): SearchResult[] {
  const terms = normalize(query)
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return [];
  const scored: Array<{ entry: Entry; score: number }> = [];
  for (const entry of INDEX) {
    let score = 0;
    let all = true;
    for (const term of terms) {
      const inTitle = entry.haystack.title.includes(term);
      const inHeading = entry.haystack.heading.includes(term);
      const inText = entry.haystack.text.includes(term);
      if (!inTitle && !inHeading && !inText) {
        all = false;
        break;
      }
      score += (inTitle ? 6 : 0) + (inHeading ? 4 : 0) + (inText ? 1 : 0);
    }
    if (all) scored.push({ entry, score: entry.heading ? score : score + 1 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ entry }) => ({
    key: `${entry.slug}#${entry.anchor ?? ''}`,
    href: `/knowledge/${entry.slug}${entry.anchor ? `#${entry.anchor}` : ''}`,
    articleTitle: entry.articleTitle,
    section: entry.section,
    heading: entry.heading,
    snippet: snippet(entry.text, terms),
    terms,
  }));
}

function snippet(text: string, terms: string[]): string {
  const lower = normalize(text);
  const at = Math.max(
    0,
    Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), text.length),
  );
  const start = Math.max(0, at - 50);
  const end = Math.min(text.length, start + 150);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
