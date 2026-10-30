import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useSearchParams } from 'react-router';
import { Library, Search } from 'lucide-react';
import { useDeferredValue, useId, useState } from 'react';
import { LearningView } from '@/components/governance/Learning';
import { MemoryCard } from '@/components/governance/parts';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { INDICATOR_SPRING, StaggerItem, StaggerList } from '@/components/ui/motion';
import { Panel } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const FLOW = [
  { name: 'Decision approved', detail: 'A named approver records it after mandatory expert review.' },
  { name: 'Handoff completed', detail: 'The operations owner carries it out and records what happened.' },
  {
    name: 'Lesson kept',
    detail: 'Expected figures, outcome and lesson become precedent for this institution only.',
  },
];

/** Institutional memory: approved decisions with recorded outcomes, searchable within the institution only. */
const VIEWS = [
  { value: 'entries', label: 'memory.view.entries' },
  { value: 'learning', label: 'memory.view.learning' },
] as const;
const tabClass =
  'relative px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink data-[state=active]:text-ink';

export function MemoryPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'learning' ? 'learning' : 'entries';
  return (
    <>
      <PageHeader
        title={t('nav.memory')}
        description="Approved decisions, what the scenario expected, what actually happened and the lesson kept, and what the institution has learned from the misses. Searchable within this institution only; nothing is shared across institutions or used to train models."
      />
      <Tabs.Root
        value={view}
        onValueChange={(v) => setParams(v === 'entries' ? {} : { view: v }, { replace: true })}
      >
        <Tabs.List aria-label="Memory views" className="mb-5 flex flex-wrap gap-1 border-b border-line">
          {VIEWS.map((x) => (
            <Tabs.Trigger key={x.value} value={x.value} className={tabClass}>
              {t(x.label)}
              {view === x.value ? (
                <motion.span
                  layoutId="memory-tab-indicator"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-gold"
                  transition={INDICATOR_SPRING}
                  aria-hidden
                />
              ) : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="entries" className="outline-none">
          <MemoryEntries />
        </Tabs.Content>
        <Tabs.Content value="learning" className="outline-none">
          <LearningView />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}

function MemoryEntries() {
  const [term, setTerm] = useState('');
  const q = useDeferredValue(term.trim());
  const res = useQuery({ queryKey: ['memory', q], queryFn: () => api.memory(q.length >= 2 ? q : '') });
  const searchId = useId();
  return (
    <>
      <div className="mb-5 max-w-xl">
        <label htmlFor={searchId} className="text-sm font-medium text-ink">
          Search memory
        </label>
        <div className="relative mt-1.5">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            id={searchId}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Action, lesson, outcome or case"
            className="h-10 w-full rounded-lg border border-line-strong bg-panel ps-9 pe-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand"
          />
        </div>
      </div>
      <LoadState isPending={res.isPending} error={res.error} />
      {res.data ? (
        res.data.length === 0 ? (
          q.length >= 2 ? (
            <p className="text-sm text-ink-muted">Nothing in memory matches &ldquo;{q}&rdquo;.</p>
          ) : (
            <Panel>
              <p className="flex items-start gap-2 px-5 pt-4 text-sm text-ink-muted">
                <Library className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" aria-hidden />
                <span>
                  <span className="font-medium text-ink">No institutional memory yet.</span> An entry appears
                  when an approved decision&apos;s outcome is recorded.
                </span>
              </p>
              <ol className="grid gap-px px-5 pt-3 pb-5 sm:grid-cols-3">
                {FLOW.map((s) => (
                  <li key={s.name} className="border-s-2 border-line-strong py-1 ps-3 pe-4">
                    <p className="text-sm font-medium text-ink">{s.name}</p>
                    <p className="text-[13px] text-ink-muted">{s.detail}</p>
                  </li>
                ))}
              </ol>
            </Panel>
          )
        ) : (
          <>
            <p className="tabular mb-3 text-sm text-ink-muted" aria-live="polite">
              {res.data.length} {res.data.length === 1 ? 'entry' : 'entries'}
              {q.length >= 2 ? ` matching “${q}”` : ''}
            </p>
            <StaggerList className="space-y-4">
              {res.data.map((m) => (
                <StaggerItem key={m.id}>
                  <MemoryCard m={m} />
                </StaggerItem>
              ))}
            </StaggerList>
          </>
        )
      ) : null}
    </>
  );
}
