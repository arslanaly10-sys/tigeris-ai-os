import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/ui/panel';
import { useI18n } from '@/lib/i18n';
import type { NavItem } from '@/nav';

/** Honest placeholder for modules scheduled in later phases — no mock data. */
export function PlannedModulePage({ item }: { item: NavItem }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t(item.labelKey)} description={item.purpose} />
      <Panel className="max-w-2xl">
        <div className="flex gap-4 px-5 py-5">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-gold-bright" aria-hidden />
          <div>
            <p className="font-semibold text-ink">{t('common.phase').replace('{n}', String(item.phase))}</p>
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
