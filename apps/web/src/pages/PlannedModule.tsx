import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { useI18n } from '@/lib/i18n';
import type { NavItem } from '@/nav';

/** Honest placeholder for modules scheduled in later phases — no mock data. */
export function PlannedModulePage({ item }: { item: NavItem }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t(item.labelKey)} description={item.purpose} />
      <Panel>
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:divide-x md:divide-line">
          <div className="flex gap-3 px-5 py-5">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-gold-bright" aria-hidden />
            <div>
              <p className="font-semibold text-ink">{t('common.phase').replace('{n}', String(item.phase))}</p>
              <p className="mt-1 text-sm text-ink-muted">
                Part of the 12-week MVP plan and not built yet. It shows no data rather than placeholder
                figures.
              </p>
            </div>
          </div>
          <div className="border-t border-line px-5 py-5 md:border-t-0">
            <h2 className="text-base text-ink">What it will hold</h2>
            <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm text-ink">
              {item.willDo.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
      {item.flow ? (
        <Panel aria-labelledby="flow-heading" className="mt-6">
          <PanelHeader
            id="flow-heading"
            title="How it fills"
            description="Nothing reaches it automatically. Each step is a recorded human action."
          />
          <ol className="grid gap-4 border-t border-line px-5 py-5 sm:grid-cols-2 xl:grid-cols-4">
            {item.flow.map((st) => (
              <li key={st.name} className="border-s-2 border-line-strong ps-3">
                <p className="text-sm font-medium text-ink">{st.name}</p>
                <p className="text-[13px] text-ink-muted">{st.detail}</p>
                <p className="tabular mt-1 text-[13px] text-ink-faint">0 recorded</p>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </>
  );
}
