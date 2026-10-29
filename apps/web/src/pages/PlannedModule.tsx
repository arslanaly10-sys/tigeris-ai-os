import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/ui/panel';
import type { NavItem } from '@/nav';

/** Honest placeholder for modules scheduled in later phases — no mock data. */
export function PlannedModulePage({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader title={item.label} description={item.purpose} />
      <Panel className="max-w-2xl">
        <div className="flex gap-4 px-5 py-5">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-gold-text" aria-hidden />
          <div>
            <p className="font-semibold text-ink">Arrives in Phase {item.phase}</p>
            <p className="mt-1 text-sm text-ink-muted">
              This module is part of the 12-week MVP plan and is not built yet. It shows no data rather than
              placeholder figures.
            </p>
            <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-ink">
              {item.willDo.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </>
  );
}
