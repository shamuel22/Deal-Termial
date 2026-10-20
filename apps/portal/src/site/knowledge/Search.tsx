import { Search as SearchIcon } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { useCopy } from '../i18n';
import { search } from './search';

function highlight(text: string, terms: string[]): ReactNode[] {
  if (terms.length === 0) return [text];
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  );
  return text.split(pattern).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}

/** Buscador de Knowledge (DESIGN §12): resultados reales por título y contenido, accesible con teclado. */
export function KnowledgeSearch() {
  const t = useCopy();
  const navigate = useNavigate();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => search(query), [query]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes(target.tagName) &&
        !target.isContentEditable
      ) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setActive(0), [query]);

  function go(href: string) {
    setOpen(false);
    setQuery('');
    input.current?.blur();
    navigate(href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      go(results[active].href);
    } else if (e.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    }
  }

  const showPanel = open && query.trim().length > 1;

  return (
    <div
      className="dt-search"
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
    >
      <label className="dt-search__field">
        <SearchIcon size={18} strokeWidth={1.75} aria-hidden />
        <span className="dt-sr-only">{t.docs.search}</span>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && results[active] ? `${listId}-${active}` : undefined}
          placeholder={t.docs.search}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd aria-hidden title={t.docs.searchShortcut}>
          /
        </kbd>
      </label>
      {showPanel && (
        <div className="dt-search__panel">
          {results.length === 0 ? (
            <p className="dt-search__empty" role="status">
              {t.docs.noResults} “{query.trim()}”. {t.docs.noResultsHint}
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label={t.docs.search}>
              {results.map((r, i) => (
                <li key={r.key} role="presentation">
                  <a
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="dt-search__result"
                    href={r.href}
                    onMouseEnter={() => setActive(i)}
                    onClick={(e) => {
                      e.preventDefault();
                      go(r.href);
                    }}
                  >
                    <small>
                      {r.section} · {r.articleTitle}
                    </small>
                    <strong>{highlight(r.heading ?? r.articleTitle, r.terms)}</strong>
                    <span>{highlight(r.snippet, r.terms)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
