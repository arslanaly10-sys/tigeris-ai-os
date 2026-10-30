/**
 * One-at-a-time sensitivity of a stored scenario run (slice G, FR-24). Each row holds every other input central and
 * moves one input across its range; the bar spans the two resulting values on a scale shared by every row, with the
 * central estimate marked. Inputs that do not move the chosen metric are listed, not drawn.
 */
import { formatScenarioValue, SCENARIO_HORIZONS, type HorizonKey } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LoadState } from '@/components/PageHeader';
import { ClaimBadge } from '@/components/truth/badges';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const field =
  'mt-1 min-h-10 rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

export function SensitivityPanel({ scenarioKey }: { scenarioKey: string }) {
  const { t } = useI18n();
  const [metric, setMetric] = useState('nav_at_risk_peak');
  const [horizon, setHorizon] = useState<HorizonKey>('d90');
  const q = useQuery({
    queryKey: ['sensitivity', scenarioKey, metric, horizon],
    queryFn: () => api.sensitivity(scenarioKey, metric, horizon),
  });
  const d = q.data;
  const fmt = (n: number) => (d ? formatScenarioValue(n, d.metric.unit, d.metric.decimals) : '');
  const moving = d ? d.result.rows.filter((r) => r.swing > 0) : [];
  const still = d ? d.result.rows.filter((r) => r.swing === 0) : [];
  const values = d ? [d.result.central, ...moving.flatMap((r) => [r.valueAtLow, r.valueAtHigh])] : [0];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pos = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);

  return (
    <Panel aria-labelledby="sens-heading">
      <PanelHeader
        id="sens-heading"
        title={t('sensitivity.title')}
        description="Which inputs this estimate rests on. Each row moves one input across its range (assumptions to their registered low and high, drivers 20% either side of your choice) with everything else held central."
        action={
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-medium text-ink-muted">
              Metric
              <select className={`${field} block`} value={metric} onChange={(e) => setMetric(e.target.value)}>
                {(d?.metrics ?? [{ key: metric, label: 'Loading…' }]).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-ink-muted">
              Horizon
              <select
                className={`${field} block`}
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as HorizonKey)}
              >
                {SCENARIO_HORIZONS.map((h) => (
                  <option key={h.key} value={h.key}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />
      {!d ? (
        <LoadState isPending={q.isPending} error={q.error} />
      ) : (
        <div className="border-t border-line">
          <p className="tabular px-5 pt-3 text-sm text-ink">
            {d.metric.label}, {d.horizon.label}: central estimate <strong>{fmt(d.result.central)}</strong>.
          </p>
          {moving.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-muted">No input moves this metric at this horizon.</p>
          ) : (
            <div
              className="overflow-x-auto px-5 py-3"
              tabIndex={0}
              role="region"
              aria-label="Sensitivity table"
            >
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">
                  {d.metric.label} with one input at a time moved across its range
                </caption>
                <thead>
                  <tr className="text-xs text-ink-faint">
                    <th scope="col" className="py-2 pe-3 text-start font-medium">
                      Input
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      Range tested
                    </th>
                    <th scope="col" className="w-[34%] px-3 py-2 text-start font-medium">
                      <span className="sr-only">Bar</span>
                    </th>
                    <th scope="col" className="ps-3 py-2 text-end font-medium">
                      Estimate moves
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {moving.map((r) => {
                    const a = pos(Math.min(r.valueAtLow, r.valueAtHigh));
                    const b = pos(Math.max(r.valueAtLow, r.valueAtHigh));
                    return (
                      <tr key={r.ref}>
                        <th scope="row" className="py-2.5 pe-3 text-start align-top font-medium text-ink">
                          {r.label}
                          <ClaimBadge value="assumed" className="ms-2 align-middle" />
                        </th>
                        <td className="tabular px-3 py-2.5 align-top text-ink-muted">
                          {formatScenarioValue(r.inputLow, r.unit, 2)} to{' '}
                          {formatScenarioValue(r.inputHigh, r.unit, 2)}
                        </td>
                        <td className="px-3 py-2.5 align-middle" aria-hidden>
                          <div className="relative h-3 rounded-full bg-raised">
                            <div
                              className="absolute inset-y-0 rounded-full bg-brand"
                              style={{ insetInlineStart: `${a}%`, width: `${Math.max(b - a, 1)}%` }}
                            />
                            <div
                              className="absolute -inset-y-1 w-0.5 bg-ink"
                              style={{ insetInlineStart: `calc(${pos(d.result.central)}% - 1px)` }}
                            />
                          </div>
                        </td>
                        <td className="tabular ps-3 py-2.5 text-end align-top text-ink">
                          {fmt(r.valueAtLow)} to {fmt(r.valueAtHigh)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-muted">
                The dark mark is the central estimate. Bars share one scale, so longer bars are inputs the
                conclusion depends on more.
              </p>
            </div>
          )}
          {still.length ? (
            <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">
              Do not move this metric: {still.map((r) => r.label).join(', ')}.
            </p>
          ) : null}
          <p className="tabular border-t border-line px-5 py-3 text-xs text-ink-faint">
            Recomputed from run {d.scenarioKey}'s stored inputs · engine {d.engineVersion} · sensitivity{' '}
            {d.result.version} · input hash {d.inputHash.slice(0, 12)}…
          </p>
        </div>
      )}
    </Panel>
  );
}
