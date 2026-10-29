import { AnimatePresence, motion } from 'motion/react';
import type { SearchResult } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { Brain, Radar, Search, Share2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { DURATION, EASE_OUT } from '@/components/ui/motion';
import { cn } from '@/lib/cn';

const KIND_ICON = { case: Brain, signal: Radar, entity: Share2 } as const;
const KIND_LABEL = { case: 'Case', signal: 'Signal', entity: 'Entity' } as const;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Institution-scoped search across cases, signals and graph entities (ARIA combobox pattern). */
export function SearchBox({ className }: { className?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const listId = useId();
  const { t } = useI18n();
  const term = useDebounced(q.trim(), 200);
  const results = useQuery({
    queryKey: ['search', term],
    queryFn: () => api.search(term),
    enabled: term.length >= 2,
  });
  const items: SearchResult[] = term.length >= 2 ? (results.data ?? []) : [];

  const go = (r: SearchResult) => {
    setOpen(false);
    setQ('');
    navigate(r.href);
  };

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        aria-label={t('top.searchLabel')}
        placeholder={t('top.search')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && items[active]) {
            e.preventDefault();
            go(items[active]!);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="h-10 w-full rounded-lg border border-line-strong bg-panel ps-9 pe-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
      />
      <AnimatePresence>
        {open && term.length >= 2 ? (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-line bg-panel py-1 card-shadow"
          >
            {items.length === 0 ? (
              <li
                className="px-3 py-2 text-sm text-ink-muted"
                role="option"
                aria-selected="false"
                aria-disabled="true"
              >
                {results.isFetching ? 'Searching…' : 'No matches in your institution'}
              </li>
            ) : (
              items.map((r, i) => {
                const Icon = KIND_ICON[r.kind];
                return (
                  <li
                    key={`${r.kind}:${r.ref}`}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(r);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm',
                      i === active ? 'bg-raised' : '',
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{r.title}</span>
                      <span className="block text-xs text-ink-faint">
                        {KIND_LABEL[r.kind]} · {r.ref} · {r.detail}
                      </span>
                    </span>
                  </li>
                );
              })
            )}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
