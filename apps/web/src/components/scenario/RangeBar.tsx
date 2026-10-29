import type { MetricValue } from '@tigeris/shared';
import { motion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/components/ui/motion';

const pct = (v: number, max: number) => (max > 0 ? Math.min(100, Math.max(0, (v / max) * 100)) : 0);

/**
 * One metric at one horizon: the low–high band, a central tick and a dashed baseline marker on a shared
 * per-metric scale. Values are always printed beside it, so the bar never carries a number alone.
 */
export function RangeBar({ value, max, label }: { value: MetricValue; max: number; label: string }) {
  const lo = pct(value.low, max);
  const hi = pct(value.high, max);
  const mid = pct(value.central, max);
  const base = pct(value.baseline, max);
  return (
    <div className="relative h-5" role="img" aria-label={label}>
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-raised" />
      <motion.div
        className="absolute top-1/2 h-3 -translate-y-1/2 rounded-[4px] border border-brand/70 bg-brand-soft"
        style={{ insetInlineStart: `${lo}%`, width: `max(${hi - lo}%, 3px)` }}
        initial={{ opacity: 0, scaleX: 0.6 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: DURATION.slow, ease: EASE_OUT }}
      />
      <motion.div
        className="absolute top-0 h-5 w-[3px] -translate-x-1/2 rounded-full bg-brand rtl:translate-x-1/2"
        style={{ insetInlineStart: `${mid}%` }}
        layout="position"
        transition={{ duration: DURATION.base, ease: EASE_OUT }}
      />
      <div
        className="absolute top-0 h-5 border-s-2 border-dashed border-ink-faint"
        style={{ insetInlineStart: `${base}%` }}
      />
    </div>
  );
}

export function RangeLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-muted" aria-label="Chart key">
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-6 rounded-[4px] border border-brand/70 bg-brand-soft" aria-hidden />
        Range, low to high
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-4 w-[3px] rounded-full bg-brand" aria-hidden />
        Central
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-4 border-s-2 border-dashed border-ink-faint" aria-hidden />
        Baseline (no disruption)
      </li>
    </ul>
  );
}
