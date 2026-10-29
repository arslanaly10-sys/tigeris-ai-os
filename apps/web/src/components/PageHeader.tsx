import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/**
 * Page header from the approved concepts: eyebrow, serif title, lead, and a status strip with
 * "Demonstration", last-updated time and source status. Optional illustration fills the right side.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  meta,
  lastUpdated,
  sourceStatus,
  illustration,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  meta?: ReactNode;
  lastUpdated?: string | null;
  sourceStatus?: 'connected' | 'partial' | 'not_connected';
  illustration?: ReactNode;
}) {
  const { t } = useI18n();
  const showStrip = lastUpdated !== undefined || sourceStatus !== undefined;
  return (
    <div className="relative mb-6 overflow-hidden">
      {illustration ? (
        <div className="pointer-events-none absolute inset-y-0 end-0 hidden w-[46%] md:block rtl:-scale-x-100">
          {illustration}
        </div>
      ) : null}
      <div className="relative flex flex-wrap items-end justify-between gap-4 py-1">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.22em] text-gold-bright">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-3xl leading-tight text-ink sm:text-[2.35rem]">{title}</h1>
          {description ? <p className="mt-1.5 text-[15px] text-ink-muted">{description}</p> : null}
          {showStrip ? (
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
              <span className="rounded border border-gold/50 bg-gold-soft px-1.5 py-0.5 font-semibold text-gold-bright">
                {t('demo.label')}
              </span>
              {lastUpdated !== undefined ? (
                <span>
                  {t('common.lastUpdated')}: {lastUpdated ? formatRelative(lastUpdated) : '—'}
                </span>
              ) : null}
              {sourceStatus ? <SourceStatusDot status={sourceStatus} /> : null}
            </p>
          ) : null}
        </div>
        {meta}
      </div>
    </div>
  );
}

export function SourceStatusDot({ status }: { status: 'connected' | 'partial' | 'not_connected' }) {
  const { t } = useI18n();
  const label =
    status === 'connected'
      ? 'Sources connected'
      : status === 'partial'
        ? 'Some sources connected'
        : t('common.sourceNotConnected');
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          status === 'connected'
            ? 'bg-emerald'
            : status === 'partial'
              ? 'bg-gold'
              : 'border border-ink-faint bg-transparent',
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function LoadState({ isPending, error }: { isPending: boolean; error: unknown }) {
  const { t } = useI18n();
  if (isPending) return <p className="text-sm text-ink-muted">{t('common.loading')}</p>;
  if (error)
    return (
      <p role="alert" className="rounded-lg border border-red/50 bg-red-soft px-4 py-3 text-sm text-red">
        This view could not be loaded. The service returned an error; nothing has been changed.
      </p>
    );
  return null;
}
