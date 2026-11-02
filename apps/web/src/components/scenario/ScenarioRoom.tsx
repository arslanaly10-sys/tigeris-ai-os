/**
 * Oil-price-shock template and scenario room (Phase 5F, FR-57). The oil shock runs on a case with the positions the
 * analyst may read and the oil assumptions in the register; the room puts up to four runs side by side with ranges.
 * Every figure names its engine version; ranges are shown as low – central – high, never a bare number.
 */
import type { ScenarioRoomRun, TemplateRunDetail } from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns3, Droplets, Lock } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { LoadState } from '@/components/PageHeader';
import { ClaimBadge } from '@/components/truth/badges';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ApiError, api } from '@/lib/api';
import { formatRelative } from '@/lib/format';

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

const fmt = (v: number, unit: string) =>
  unit === 'USD m'
    ? `USD ${Number(v.toFixed(1)).toLocaleString('en')} m`
    : `${Number(v.toFixed(2)).toLocaleString('en')}${unit ? ` ${unit}` : ''}`;
const signed = (v: number, unit: string) => `${v > 0 ? '+' : ''}${fmt(v, unit)}`;
const range = (r: { low: number; central: number; high: number }, unit: string) =>
  `${signed(r.low, unit)} to ${signed(r.high, unit)}`;

function OilResultView({ d }: { d: TemplateRunDetail }) {
  const r = d.result;
  return (
    <div className="grid gap-4 border-t border-line px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-line px-4 py-3">
          <p className="text-xs text-ink-muted">Change in NAV (central)</p>
          <p className="tabular text-2xl font-semibold text-ink">
            {signed(r.navImpactPct.central, '% of NAV')}
          </p>
          <p className="tabular text-xs text-ink-muted">Envelope {range(r.navImpactPct, '%')}</p>
        </div>
        <div className="rounded-md border border-line px-4 py-3">
          <p className="text-xs text-ink-muted">Change in market value (central)</p>
          <p className="tabular text-2xl font-semibold text-ink">{signed(r.valueImpact.central, 'USD m')}</p>
          <p className="tabular text-xs text-ink-muted">Envelope {range(r.valueImpact, 'USD m')}</p>
        </div>
      </div>
      {r.valueExcluded ? (
        <p className="text-xs text-ink-muted">
          {r.valueExcluded} position{r.valueExcluded === 1 ? ' is' : 's are'} held in another currency and
          left out of the value change; the change in NAV includes {r.valueExcluded === 1 ? 'it' : 'them'}.
        </p>
      ) : null}
      <p className="text-xs text-ink-muted">{r.method}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Contribution to NAV by position</caption>
          <thead>
            <tr className="bg-raised text-xs text-ink-muted">
              <th scope="col" className="px-3 py-2 text-start font-semibold">
                Position
              </th>
              <th scope="col" className="px-3 py-2 text-start font-semibold">
                Sector
              </th>
              <th scope="col" className="px-3 py-2 text-start font-semibold">
                Share of NAV
              </th>
              <th scope="col" className="px-3 py-2 text-start font-semibold">
                Contribution (central)
              </th>
              <th scope="col" className="px-3 py-2 text-start font-semibold">
                Envelope
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.positions.map((p) => (
              <tr key={p.key}>
                <th scope="row" className="px-3 py-2 text-start font-medium text-ink">
                  {p.name}
                  <span className="block text-[12px] font-normal text-ink-faint">
                    {p.key} · {p.assetClass} · {p.assumptionKeys.join(', ')}
                  </span>
                </th>
                <td className="px-3 py-2 text-ink-muted">{p.sectorKey ?? 'Unassigned'}</td>
                <td className="tabular px-3 py-2 text-ink">{fmt(p.navSharePct, '%')}</td>
                <td className="tabular px-3 py-2 text-ink">{signed(p.navImpactPct.central, '% of NAV')}</td>
                <td className="tabular px-3 py-2 text-ink-muted">{range(p.navImpactPct, '%')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.hiddenPositions ? (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {r.hiddenPositions} position{r.hiddenPositions === 1 ? ' is' : 's are'} outside your read scope and
          not listed; the totals include {r.hiddenPositions === 1 ? 'it' : 'them'}.
        </p>
      ) : null}
      <p className="text-[12px] text-ink-faint">
        {d.key} · {d.engineVersion} · case{' '}
        <Link className="text-brand underline-offset-2 hover:underline" to={`/cases/${d.caseKey}`}>
          {d.caseKey}
        </Link>{' '}
        · run by {d.createdBy} {formatRelative(d.createdAt)} ·{' '}
        {d.intact ? 'output hash verified' : 'output hash does not match'}
      </p>
    </div>
  );
}

export function OilShockView() {
  const id = useId();
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ['templates'], queryFn: api.templates });
  const oil = t.data?.templates.find((x) => x.key === 'oil-price-shock');
  const [caseKey, setCaseKey] = useState('HMZ-2024-0413');
  const [values, setValues] = useState<Record<string, string>>({});
  const [last, setLast] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['template-run', last],
    queryFn: () => api.templateRun(last!),
    enabled: !!last,
  });
  const m = useMutation({
    mutationFn: () =>
      api.runOilShock({
        caseKey,
        drivers: Object.fromEntries(
          (oil?.drivers ?? []).map((d) => [d.key, Number(values[d.key] ?? d.default)]),
        ),
      }),
    onSuccess: async (r) => {
      setLast(r.key);
      await qc.invalidateQueries({ queryKey: ['scenario-room'] });
    },
  });
  if (!t.data || !oil) return <LoadState isPending={t.isPending} error={t.error} />;
  return (
    <div className="grid gap-6">
      <Panel aria-labelledby="oil-heading">
        <PanelHeader
          id="oil-heading"
          icon={<Droplets className="h-4 w-4" aria-hidden />}
          title={oil.title}
          description={`${oil.description} ${oil.version}. Illustrative simulation on the positions you may read.`}
        />
        {t.data.canRun ? (
          <form
            className="grid gap-3 border-t border-line px-5 py-4 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <label className="text-sm font-medium text-ink" htmlFor={`${id}-case`}>
              Case
              <input
                id={`${id}-case`}
                className={field}
                value={caseKey}
                onChange={(e) => setCaseKey(e.target.value)}
              />
            </label>
            {oil.drivers.map((d) => (
              <label key={d.key} className="text-sm font-medium text-ink" htmlFor={`${id}-${d.key}`}>
                {d.label} ({d.unit}, {d.min} to {d.max})
                <input
                  id={`${id}-${d.key}`}
                  className={field}
                  type="number"
                  min={d.min}
                  max={d.max}
                  step={d.step}
                  value={values[d.key] ?? String(d.default)}
                  onChange={(e) => setValues({ ...values, [d.key]: e.target.value })}
                />
              </label>
            ))}
            {m.error ? (
              <p role="alert" className="text-sm text-red md:col-span-3">
                {m.error instanceof ApiError && m.error.code === 'not_found'
                  ? 'No case with that key that you may read.'
                  : 'Keep each driver inside its range.'}
              </p>
            ) : null}
            <div className="md:col-span-3">
              <Button type="submit" variant="primary" disabled={m.isPending}>
                Run oil price shock
              </Button>
            </div>
          </form>
        ) : (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
            An Intelligence Analyst runs this template. You can read its runs in the scenario room.
          </p>
        )}
        {detail.data ? <OilResultView d={detail.data} /> : null}
      </Panel>
      <Panel aria-labelledby="oil-assumptions-heading">
        <PanelHeader
          id="oil-assumptions-heading"
          title="Assumptions this template uses"
          description="From the assumption register: versioned, owned by a domain expert, and open to the learning loop."
        />
        <ul className="divide-y divide-line border-t border-line">
          {t.data.oilAssumptions.map((a) => (
            <li key={a.key} className="grid gap-1 px-5 py-3 md:grid-cols-[minmax(0,1fr)_14rem]">
              <span>
                <span className="block text-sm font-medium text-ink">{a.label}</span>
                <span className="block text-xs text-ink-muted">{a.rationale}</span>
              </span>
              <span className="flex flex-col items-start gap-1">
                <span className="tabular text-sm text-ink">
                  {a.low} – {a.central} – {a.high} {a.unit}
                </span>
                <span className="text-[12px] text-ink-faint">
                  {a.key} · v{a.version}
                </span>
                <ClaimBadge value={a.claimClass} />
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function RoomTable({ runs }: { runs: ScenarioRoomRun[] }) {
  const templates = [...new Set(runs.map((r) => r.templateKey))];
  return (
    <div className="grid gap-5 border-t border-line px-5 py-4">
      {templates.map((tk) => {
        const mine = runs.filter((r) => r.templateKey === tk);
        const figures = mine[0]!.figures;
        const driverKeys = [...new Set(mine.flatMap((r) => Object.keys(r.drivers)))];
        return (
          <div key={tk} className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="pb-2 text-start text-xs font-semibold text-ink-muted">
                {tk === 'oil-price-shock' ? 'Oil price shock runs' : 'Hormuz disruption runs'} · ranges are
                low to high, central in bold
              </caption>
              <thead>
                <tr className="bg-raised text-xs text-ink-muted">
                  <th scope="col" className="px-3 py-2 text-start font-semibold">
                    Figure
                  </th>
                  {mine.map((r) => (
                    <th key={r.key} scope="col" className="px-3 py-2 text-start font-semibold">
                      {r.key}
                      <span className="block font-normal text-ink-faint">
                        {r.caseKey} · {r.engineVersion}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {driverKeys.map((k) => {
                  const differs = new Set(mine.map((r) => r.drivers[k])).size > 1;
                  return (
                    <tr key={k}>
                      <th scope="row" className="px-3 py-2 text-start font-normal text-ink-muted">
                        Driver: {k}
                        {differs ? (
                          <span className="ms-1 text-[12px] text-gold-bright">(differs)</span>
                        ) : null}
                      </th>
                      {mine.map((r) => (
                        <td key={r.key} className="tabular px-3 py-2 text-ink">
                          {r.drivers[k] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {figures.map((f) => (
                  <tr key={f.key}>
                    <th scope="row" className="px-3 py-2 text-start font-medium text-ink">
                      {f.label}
                      <span className="block text-[12px] font-normal text-ink-faint">{f.unit}</span>
                    </th>
                    {mine.map((r) => {
                      const v = r.figures.find((x) => x.key === f.key);
                      return (
                        <td key={r.key} className="tabular px-3 py-2 text-ink">
                          {v ? (
                            <>
                              <span className="font-semibold">
                                {fmt(v.central, f.unit === 'USD m' ? 'USD m' : '')}
                              </span>
                              <span className="block text-xs text-ink-muted">
                                {fmt(v.low, f.unit === 'USD m' ? 'USD m' : '')} to{' '}
                                {fmt(v.high, f.unit === 'USD m' ? 'USD m' : '')}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function ScenarioRoomView() {
  const id = useId();
  const [chosen, setChosen] = useState<string[]>([]);
  const q = useQuery({ queryKey: ['scenario-room', chosen], queryFn: () => api.scenarioRoom(chosen) });
  return (
    <Panel aria-labelledby="room-heading">
      <PanelHeader
        id="room-heading"
        icon={<Columns3 className="h-4 w-4" aria-hidden />}
        title="Scenario room"
        description="Choose up to four runs to compare side by side. Runs of different templates are shown in separate tables, because their figures are not comparable."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        <>
          <fieldset className="border-t border-line px-5 py-4">
            <legend className="sr-only">Runs to compare</legend>
            {q.data.available.length ? (
              <ul className="grid gap-1 sm:grid-cols-2">
                {q.data.available.slice(0, 20).map((a) => (
                  <li key={a.key}>
                    <label
                      className="flex min-h-10 items-start gap-2 text-sm text-ink"
                      htmlFor={`${id}-${a.key}`}
                    >
                      <input
                        id={`${id}-${a.key}`}
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={chosen.includes(a.key)}
                        disabled={!chosen.includes(a.key) && chosen.length >= 4}
                        onChange={(e) =>
                          setChosen(e.target.checked ? [...chosen, a.key] : chosen.filter((k) => k !== a.key))
                        }
                      />
                      <span>
                        <span className="tabular text-xs text-ink-faint">{a.key}</span> {a.title}
                        <span className="block text-[12px] text-ink-faint">
                          {a.caseKey} · {formatRelative(a.createdAt)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No runs yet. Run a scenario from a case first.</p>
            )}
          </fieldset>
          {q.data.runs.length ? <RoomTable runs={q.data.runs} /> : null}
        </>
      ) : null}
    </Panel>
  );
}
