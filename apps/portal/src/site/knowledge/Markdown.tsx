import { AlertTriangle, Check, Copy, Info, Lightbulb } from 'lucide-react';
import { marked, type Token, type Tokens } from 'marked';
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useCopy } from '../i18n';
import { slugify } from './slug';

export interface Heading {
  id: string;
  text: string;
  depth: 2 | 3;
}

/** Encabezados de nivel 2 y 3 de un artículo, para el índice y la búsqueda. */
export function extractHeadings(markdown: string): Heading[] {
  return marked
    .lexer(markdown)
    .filter((t): t is Tokens.Heading => t.type === 'heading' && (t.depth === 2 || t.depth === 3))
    .map((t) => ({ id: slugify(t.text), text: plain(t.text), depth: t.depth as 2 | 3 }));
}

export function plain(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/** Contenido propio y versionado: el HTML en línea procede solo de nuestros archivos Markdown. */
function Inline({ text }: { text: string }) {
  return (
    <span
      dangerouslySetInnerHTML={{ __html: marked.parseInline(text, { async: false }) as string }}
    />
  );
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const t = useCopy();
  const [copied, setCopied] = useState(false);
  return (
    <div className="dt-code">
      <div className="dt-code__bar">
        <span>{lang || 'text'}</span>
        <button
          type="button"
          className="dt-code__copy"
          onClick={() =>
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            })
          }
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          <span aria-live="polite">{copied ? t.docs.copied : t.docs.copy}</span>
        </button>
      </div>
      <pre tabIndex={0} translate="no">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const CALLOUTS = {
  note: { className: 'dt-callout--note', Icon: Info },
  important: { className: 'dt-callout--important', Icon: Lightbulb },
  warning: { className: 'dt-callout--warning', Icon: AlertTriangle },
} as const;

function Callout({ token }: { token: Tokens.Blockquote }) {
  const first = token.tokens[0];
  const text = first && 'raw' in first ? first.raw : '';
  const match = /^\*\*(Note|Important|Warning):\*\*/i.exec(text.trim());
  const kind = (match?.[1]?.toLowerCase() ?? 'note') as keyof typeof CALLOUTS;
  const { className, Icon } = CALLOUTS[kind];
  return (
    <aside className={`dt-callout ${className}`}>
      <Icon size={18} strokeWidth={1.75} aria-hidden />
      <div>{render(token.tokens)}</div>
    </aside>
  );
}

function render(tokens: Token[]): ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case 'heading': {
        const h = token as Tokens.Heading;
        const id = slugify(h.text);
        if (h.depth === 2)
          return (
            <h2 key={i} id={id}>
              <Inline text={h.text} />
            </h2>
          );
        if (h.depth === 3)
          return (
            <h3 key={i} id={id}>
              <Inline text={h.text} />
            </h3>
          );
        return (
          <h4 key={i}>
            <Inline text={h.text} />
          </h4>
        );
      }
      case 'paragraph':
        return (
          <p key={i}>
            <Inline text={(token as Tokens.Paragraph).text} />
          </p>
        );
      case 'code': {
        const c = token as Tokens.Code;
        return <CodeBlock key={i} code={c.text} lang={c.lang} />;
      }
      case 'blockquote':
        return <Callout key={i} token={token as Tokens.Blockquote} />;
      case 'list': {
        const l = token as Tokens.List;
        const items = l.items.map((item, j) => (
          <li key={j}>
            {item.tokens.some((t) => t.type === 'list' || t.type === 'code') ? (
              render(item.tokens)
            ) : (
              <Inline text={item.text} />
            )}
          </li>
        ));
        return l.ordered ? (
          <ol key={i} start={l.start || 1}>
            {items}
          </ol>
        ) : (
          <ul key={i}>{items}</ul>
        );
      }
      case 'table': {
        const tb = token as Tokens.Table;
        return (
          <div key={i} className="dt-table-wrap" tabIndex={0} role="region" aria-label="Table">
            <table>
              <thead>
                <tr>
                  {tb.header.map((cell, j) => (
                    <th key={j} scope="col">
                      <Inline text={cell.text} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tb.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, j) => (
                      <td key={j}>
                        <Inline text={cell.text} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'text':
        return (
          <p key={i}>
            <Inline text={(token as Tokens.Text).text} />
          </p>
        );
      case 'hr':
        return <hr key={i} />;
      case 'space':
        return null;
      default:
        return null;
    }
  });
}

/** Renderiza un artículo; los enlaces internos navegan sin recargar la página. */
export function Markdown({ source }: { source: string }) {
  const navigate = useNavigate();
  const nodes = useMemo(() => render(marked.lexer(source)), [source]);
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!anchor || !href || e.metaKey || e.ctrlKey || e.shiftKey || anchor.target) return;
    if (href.startsWith('/')) {
      e.preventDefault();
      navigate(href);
    }
  }
  return (
    <div className="dt-prose" onClick={onClick}>
      {nodes}
    </div>
  );
}
