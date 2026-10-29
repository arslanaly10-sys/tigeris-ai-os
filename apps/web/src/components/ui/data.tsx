/**
 * Data display primitives that never invent values (CLAUDE.md §2):
 * a KPI either shows a lineage-backed value or "— Source not connected"; a chart frame without an
 * approved series shows "Connect authorised data".
 */
import type { SectorKpi } from '@tigeris/shared';
import { BarChart3, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ClaimBadge, ValidationBadge } from '@/components/truth/badges';
import { cn } from '@/lib/cn';
import { formatFactValue } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export function KpiCard({
  kpi,
  icon: Icon,
  onLineage,
}: {
  kpi: SectorKpi;
  icon: LucideIcon;
  onLineage?: (kpi: SectorKpi) => void;
}) {
  const { t } = useI18n();
  const v = kpi.value;
  return (
    <div className="card-shadow flex min-h-[7.5rem] flex-col rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-bright">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm font-medium leading-snug text-ink">{kpi.label}</p>
      </div>
      {v ? (
        <div className="mt-auto pt-3">
          <p className="tabular font-serif text-2xl font-semibold text-ink">{formatFactValue(v)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ClaimBadge value={v.claimClass} />
            {v.validationStatus !== 'validated' ? <ValidationBadge value={v.validationStatus} /> : null}
            {onLineage ? (
              <button
                type="button"
                onClick={() => onLineage(kpi)}
                className="ms-auto text-xs font-medium text-cyan hover:underline"
              >
                {t('common.lineage')}
                <span className="sr-only"> for {kpi.label}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-auto pt-3">
          <p className="font-serif text-2xl text-ink-faint" aria-hidden>
            —
          </p>
          <p className="text-xs text-ink-faint">{t('common.sourceNotConnected')}</p>
        </div>
      )}
    </div>
  );
}

/** An empty chart frame with faint axes; states plainly that no authorised series is connected. */
export function ConnectDataChart({
  xLabels,
  yLabel,
  className,
}: {
  xLabels: string[];
  yLabel?: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <figure className={cn('relative', className)}>
      <div className="relative h-44 border-s border-b border-line ps-2">
        {[0, 25, 50, 75].map((p) => (
          <div
            key={p}
            className="absolute inset-x-0 border-t border-dashed border-line"
            style={{ bottom: `${p + 25}%` }}
          />
        ))}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <BarChart3 className="h-6 w-6 text-brand/70" aria-hidden />
          <p className="mt-1.5 text-sm font-medium text-ink">{t('common.connectData')}</p>
          <p className="max-w-xs text-xs text-ink-faint">{t('common.connectDataHint')}</p>
        </div>
      </div>
      <figcaption className="sr-only">{yLabel ?? 'Chart'}: no authorised data connected</figcaption>
      <div className="mt-1.5 flex justify-between ps-2 text-[11px] text-ink-faint" aria-hidden>
        {xLabels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </figure>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: 'awaiting' | 'high' | 'medium' | 'low' | 'ok';
  children: ReactNode;
}) {
  const cls = {
    awaiting: 'bg-gold-soft text-gold-bright border-gold/40',
    high: 'bg-red-soft text-red border-red/30',
    medium: 'bg-amber-soft text-amber border-amber/30',
    low: 'bg-emerald-soft text-emerald border-emerald/30',
    ok: 'bg-emerald-soft text-emerald border-emerald/30',
  }[tone];
  return (
    <span className={cn('whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium', cls)}>
      {children}
    </span>
  );
}

/** A list row with icon tile, title, description, trailing status and chevron (concept list pattern). */
export function ListRow({
  icon: Icon,
  title,
  description,
  trailing,
  to,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  to?: string;
}) {
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-gold-bright">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {description ? <span className="block text-xs text-ink-muted">{description}</span> : null}
      </span>
      {trailing}
      {to ? <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint rtl:rotate-180" aria-hidden /> : null}
    </>
  );
  const cls = 'flex items-center gap-3 px-5 py-3';
  return to ? (
    <Link to={to} className={cn(cls, 'transition-colors hover:bg-raised/60')}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
