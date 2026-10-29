import {
  formatScenarioValue,
  GROUPS,
  SECTORS,
  type DriverDef,
  type DriverKey,
  type Drivers,
  type HorizonKey,
  type MetricDef,
  type ScenarioRunDetail,
  type ScenarioSetup,
} from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  Calculator,
  CheckCircle2,
  FileWarning,
  GitFork,
  Gavel,
  Play,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LineageDrawer, type LineageTarget } from '@/components/LineageDrawer';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { CalcSheet } from '@/components/scenario/CalcSheet';
import {
  AgentDraft,
  ConfidenceBasisList,
  MandateChecks,
  OptionCard,
  SEVERITY_TONE,
  severityLabel,
} from '@/components/scenario/Drafts';
import { RangeBar, RangeLegend } from '@/components/scenario/RangeBar';
import { ClaimBadge, DataModeBadge } from '@/components/truth/badges';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/data';
import {
  FadeSwap,
  INDICATOR_SPRING,
  StaggerBlock,
  StaggerGroup,
  StaggerItem,
  StaggerList,
} from '@/components/ui/motion';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/** Sector scenarios that no engine template models yet — listed honestly rather than hidden. */
const NOT_MODELLED = SECTORS.flatMap((s) =>
  s.scenarios.filter((x) => !x.modelTemplate).map((x) => ({ ...x, sector: s.label })),
);
const MODELLED = SECTORS.flatMap((s) =>
  s.scenarios.filter((x) => x.modelTemplate).map((x) => ({ ...x, sector: s.label })),
);

export function ScenariosPage() {
  const { t } = useI18n();
  const setup = useQuery({ queryKey: ['scenario-setup'], queryFn: api.scenarioSetup });
  const runs = useQuery({ queryKey: ['scenarios'], queryFn: () => api.scenarios() });
  return (
    <>
      <PageHeader
        title={t('nav.scenarios')}
        description="Baseline and what-if scenarios across 72 hours, 90 days, one year and five years. Deterministic engine, labelled assumptions, reproducible runs."
        meta={
          setup.data?.canRun ? (
            <Link to="/scenarios/new" className={buttonVariants({ variant: 'primary' })}>
              <Plus className="h-4 w-4" aria-hidden />
              New scenario
            </Link>
          ) : null
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel aria-labelledby="runs-heading">
          <PanelHeader
            id="runs-heading"
            icon={<GitFork className="h-4 w-4" aria-hidden />}
            title="Scenario runs"
            description="Every run is stored with its drivers, inputs and engine version and can be re-computed."
          />
          <LoadState isPending={runs.isPending} error={runs.error} />
          {runs.data ? (
            runs.data.length === 0 ? (
              <div className="flex flex-col items-center border-t border-line px-5 py-12 text-center">
                <GitFork className="h-7 w-7 text-brand/70" aria-hidden />
                <p className="mt-2 text-sm font-medium text-ink">No scenario runs yet</p>
                <p className="max-w-md text-xs text-ink-faint">
                  An Intelligence Analyst runs a scenario from a case. Results appear here with their ranges
                  and draft options.
                </p>
              </div>
            ) : (
              <StaggerList className="divide-y divide-line border-t border-line">
                {runs.data.map((r) => (
                  <StaggerItem key={r.id}>
                    <Link to={`/scenarios/${r.key}`} className="block px-5 py-3.5 hover:bg-raised/60">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="tabular font-mono text-[11px] text-ink-faint">{r.key}</span>
                        <DataModeBadge value="scenario" />
                        {r.severity ? (
                          <StatusPill tone={SEVERITY_TONE[r.severity]}>
                            {severityLabel(r.severity)}
                          </StatusPill>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm font-medium text-ink">{r.title}</span>
                      <span className="text-[11px] text-ink-faint">
                        Case {r.caseKey} · {r.caseTitle} · {r.createdBy} · {formatRelative(r.createdAt)}
                      </span>
                    </Link>
                  </StaggerItem>
                ))}
              </StaggerList>
            )
          ) : null}
        </Panel>

        <div className="space-y-6">
          <Panel aria-labelledby="templates-heading">
            <PanelHeader
              id="templates-heading"
              title="Modelled scenarios"
              description="Served by engine hormuz-disruption 1.0.0."
            />
            <ul className="divide-y divide-line border-t border-line">
              {MODELLED.map((s) => (
                <li key={s.key} className="px-5 py-3">
                  <p className="text-sm font-medium text-ink">{s.title}</p>
                  <p className="text-xs text-ink-muted">
                    {s.sector} · {s.description}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel aria-labelledby="notmodelled-heading">
            <PanelHeader
              id="notmodelled-heading"
              title="Not yet modelled"
              description="Configured in a sector pack; no engine template exists, so they cannot be run."
            />
            <ul className="divide-y divide-line border-t border-line">
              {NOT_MODELLED.map((s) => (
                <li key={`${s.sector}:${s.key}`} className="px-5 py-2.5">
                  <p className="text-sm text-ink-muted">{s.title}</p>
                  <p className="text-[11px] text-ink-faint">{s.sector}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

function initialDrivers(setup: ScenarioSetup): Drivers {
  const out = {} as Drivers;
  for (const d of setup.drivers) {
    const fromRegister = d.defaultFromAssumption
      ? setup.assumptions.find((a) => a.key === d.defaultFromAssumption)?.central
      : undefined;
    out[d.key] = d.default ?? fromRegister ?? d.min;
  }
  return out;
}

function DriverControl({
  def,
  value,
  onChange,
  setup,
}: {
  def: DriverDef;
  value: number;
  onChange: (v: number) => void;
  setup: ScenarioSetup;
}) {
  const id = `driver-${def.key}`;
  const register = def.defaultFromAssumption
    ? setup.assumptions.find((a) => a.key === def.defaultFromAssumption)
    : undefined;
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="flex-1 text-sm font-medium text-ink">
          {def.label}
        </label>
        <ClaimBadge value="assumed" />
      </div>
      <p id={`${id}-desc`} className="text-xs text-ink-muted">
        {def.description}
        {register
          ? ` Register range ${formatScenarioValue(register.low, register.unit)} to ${formatScenarioValue(register.high, register.unit)} (central ${formatScenarioValue(register.central, register.unit)}).`
          : ''}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="range"
          aria-label={`${def.label} slider`}
          aria-describedby={`${id}-desc`}
          min={def.min}
          max={def.max}
          step={def.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--color-brand)]"
        />
        <span className="flex items-center gap-1.5">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={def.min}
            max={def.max}
            step={def.step}
            value={value}
            aria-describedby={`${id}-desc`}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(Math.min(def.max, Math.max(def.min, v)));
            }}
            className="tabular h-9 w-24 rounded-md border border-line-strong bg-panel px-2 text-end text-sm text-ink focus:border-brand focus:outline-none"
          />
          <span className="w-20 text-xs text-ink-muted">{def.unit}</span>
        </span>
      </div>
    </div>
  );
}

export function ScenarioBuilderPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setup = useQuery({ queryKey: ['scenario-setup'], queryFn: api.scenarioSetup });
  const [caseKey, setCaseKey] = useState<string | null>(params.get('case'));
  const [drivers, setDrivers] = useState<Drivers | null>(null);
  const run = useMutation({
    mutationFn: (v: { caseKey: string; drivers: Drivers }) => api.runScenario(v.caseKey, v.drivers),
    onSuccess: async ({ key }) => {
      await qc.invalidateQueries({ queryKey: ['scenarios'] });
      await qc.invalidateQueries({ queryKey: ['agent-runs'] });
      navigate(`/scenarios/${key}`);
    },
  });

  if (!setup.data) return <LoadState isPending={setup.isPending} error={setup.error} />;
  const s = setup.data;
  const d = drivers ?? initialDrivers(s);
  const selectedCase =
    caseKey && s.cases.some((c) => c.key === caseKey) ? caseKey : (s.cases[0]?.key ?? null);
  const set = (k: DriverKey, v: number) => setDrivers({ ...d, [k]: v });

  return (
    <>
      <Link to="/scenarios" className="mb-2 inline-flex text-sm text-cyan hover:underline">
        ← All scenarios
      </Link>
      <PageHeader
        eyebrow="New scenario"
        title={s.template.title}
        description={s.template.description}
        meta={
          <span className="text-xs text-ink-muted">
            Engine {s.template.key} {s.template.engineVersion}
          </span>
        }
      />
      {!s.canRun ? (
        <p className="mb-5 flex items-start gap-2 rounded-lg border border-line-strong bg-raised px-4 py-3 text-sm text-ink-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" aria-hidden />
          Only an Intelligence Analyst can run scenarios. You can review the drivers and assumption register.
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel aria-labelledby="drivers-heading">
          <PanelHeader
            id="drivers-heading"
            icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
            title="Drivers"
            description="The analyst's what-if. Each is recorded with the run as an assumption."
          />
          <div className="border-t border-line px-5 pb-2">
            <div className="py-4">
              <label htmlFor="scenario-case" className="text-sm font-medium text-ink">
                Case
              </label>
              <select
                id="scenario-case"
                value={selectedCase ?? ''}
                onChange={(e) => setCaseKey(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus:border-brand focus:outline-none"
              >
                {s.cases.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.key} — {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="divide-y divide-line border-t border-line">
              {s.drivers.map((def) => (
                <DriverControl
                  key={def.key}
                  def={def}
                  value={d[def.key]}
                  onChange={(v) => set(def.key, v)}
                  setup={s}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
            <Button
              variant="primary"
              disabled={!s.canRun || !selectedCase || run.isPending}
              onClick={() => selectedCase && run.mutate({ caseKey: selectedCase, drivers: d })}
            >
              <Play className="h-4 w-4" aria-hidden />
              {run.isPending ? 'Running…' : 'Run scenario'}
            </Button>
            <button
              type="button"
              className="text-sm text-cyan hover:underline"
              onClick={() => setDrivers(null)}
            >
              Reset to defaults
            </button>
          </div>
          <AnimatePresence>
            {run.isError ? (
              <motion.p
                role="alert"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mx-5 mb-4 rounded-md border border-red/50 bg-red-soft px-3 py-2 text-sm text-red"
              >
                {run.error instanceof ApiError && run.error.code === 'inputs_not_connected'
                  ? 'A required input is not connected, so the scenario cannot run.'
                  : 'The scenario could not be run. Nothing was recorded.'}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </Panel>

        <Panel aria-labelledby="register-heading">
          <PanelHeader
            id="register-heading"
            icon={<FileWarning className="h-4 w-4" aria-hidden />}
            title="Assumption register"
            description="Read-only. Ranges come from these low, central and high values."
          />
          <StaggerList className="divide-y divide-line border-t border-line">
            {s.assumptions.map((a) => (
              <StaggerItem key={a.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-sm font-medium text-ink">{a.label}</span>
                  <ClaimBadge value="assumed" />
                </div>
                <p className="tabular mt-0.5 text-sm text-ink">
                  {formatScenarioValue(a.low, a.unit)} ·{' '}
                  <strong>{formatScenarioValue(a.central, a.unit)}</strong> ·{' '}
                  {formatScenarioValue(a.high, a.unit)}
                  <span className="ms-1 text-xs text-ink-faint">(low · central · high)</span>
                </p>
                <p className="text-xs text-ink-muted">{a.rationale}</p>
              </StaggerItem>
            ))}
          </StaggerList>
        </Panel>
      </div>
    </>
  );
}

function HorizonSwitch({
  value,
  onChange,
  horizons,
}: {
  value: HorizonKey;
  onChange: (h: HorizonKey) => void;
  horizons: ScenarioRunDetail['result']['horizons'];
}) {
  return (
    <div
      role="group"
      aria-label="Horizon"
      className="inline-flex rounded-lg border border-line-strong bg-panel p-0.5"
    >
      {horizons.map((h) => (
        <button
          key={h.key}
          type="button"
          aria-pressed={value === h.key}
          onClick={() => onChange(h.key)}
          className={cn(
            'relative rounded-md px-3 py-1.5 text-sm',
            value === h.key ? 'font-semibold text-brand' : 'text-ink-muted hover:text-ink',
          )}
        >
          {value === h.key ? (
            <motion.span
              layoutId="horizon-active"
              className="absolute inset-0 rounded-md bg-brand-soft"
              transition={INDICATOR_SPRING}
              aria-hidden
            />
          ) : null}
          <span className="relative">{h.label}</span>
        </button>
      ))}
    </div>
  );
}

function MetricRow({
  def,
  run,
  horizon,
  onCalc,
}: {
  def: MetricDef;
  run: ScenarioRunDetail;
  horizon: HorizonKey;
  onCalc: () => void;
}) {
  const values = run.result.metrics.find((m) => m.key === def.key)!.values;
  const v = values[horizon];
  // One scale per metric across all horizons, so switching horizon compares like with like.
  const max = Math.max(...Object.values(values).flatMap((x) => [x.high, x.baseline])) * 1.08 || 1;
  const f = (n: number) => formatScenarioValue(n, def.unit, def.decimals);
  return (
    <li className="grid gap-x-6 gap-y-2 px-5 py-3.5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,14rem)]">
      <div>
        <p className="text-sm font-medium text-ink">{def.label}</p>
        <button
          type="button"
          onClick={onCalc}
          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
        >
          <Calculator className="h-3.5 w-3.5" aria-hidden />
          How calculated<span className="sr-only"> for {def.label}</span>
        </button>
      </div>
      <div className="self-center">
        <RangeBar
          value={v}
          max={max}
          label={`${def.label}: low ${f(v.low)}, central ${f(v.central)}, high ${f(v.high)}, baseline ${f(v.baseline)}`}
        />
      </div>
      <div className="tabular text-sm" aria-hidden>
        <p className="font-semibold text-ink">{f(v.central)}</p>
        <p className="text-xs text-ink-muted">
          {f(v.low)} to {f(v.high)} · baseline {f(v.baseline)}
        </p>
      </div>
    </li>
  );
}

export function ScenarioRunPage() {
  const { key = '' } = useParams();
  const q = useQuery({ queryKey: ['scenario', key], queryFn: () => api.scenario(key) });
  const [horizon, setHorizon] = useState<HorizonKey>('d90');
  const [calc, setCalc] = useState<MetricDef | null>(null);
  const [lineage, setLineage] = useState<LineageTarget | null>(null);
  const specialistRuns = useMemo(
    () => (q.data?.agentRuns ?? []).filter((r) => r.agentKey !== 'allocation-options'),
    [q.data],
  );

  if (q.error instanceof ApiError && q.error.status === 404)
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-10 text-center">
        <h1 className="text-2xl text-ink">Scenario not found</h1>
        <Link to="/scenarios" className="mt-4 inline-block text-sm font-medium text-cyan underline">
          Back to scenarios
        </Link>
      </div>
    );
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const r = q.data;
  const horizonLabel = r.result.horizons.find((h) => h.key === horizon)!.label;

  return (
    <>
      <Link to="/scenarios" className="mb-2 inline-flex text-sm text-cyan hover:underline">
        ← All scenarios
      </Link>
      <PageHeader
        eyebrow={`Scenario run · ${r.key}`}
        title={r.title}
        description={
          <>
            Case{' '}
            <Link to={`/cases/${r.caseKey}`} className="text-cyan hover:underline">
              {r.caseKey} · {r.caseTitle}
            </Link>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
        <DataModeBadge value="scenario" />
        <span>
          Engine {r.templateKey} {r.engineVersion}
        </span>
        <span>
          Run by {r.createdBy} · {formatDateTime(r.createdAt)}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 font-medium',
            r.reproducible ? 'text-emerald' : 'text-red',
          )}
        >
          {r.reproducible ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          )}
          {r.reproducible
            ? 'Reproducible: re-computed from stored inputs'
            : 'Re-computation does not match the stored output'}
        </span>
        <span className="font-mono text-[10.5px] text-ink-faint" title={`Input hash ${r.inputHash}`}>
          inputs {r.inputHash.slice(0, 12)}…
        </span>
      </div>

      {r.warnings.length ? (
        <ul
          className="mb-5 space-y-1 rounded-lg border border-amber/40 bg-amber-soft px-4 py-3 text-sm text-amber"
          aria-label="Warnings"
        >
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Drivers">
        {r.inputs
          .filter((i) => i.kind === 'driver')
          .map((i) => (
            <li key={i.ref} className="card-shadow rounded-xl border border-line bg-panel px-4 py-3">
              <p className="text-xs text-ink-muted">{i.label}</p>
              <p className="tabular mt-0.5 font-serif text-xl font-semibold text-ink">
                {i.kind === 'driver' ? formatScenarioValue(i.value, i.unit, 1) : null}
              </p>
              <ClaimBadge value="assumed" className="mt-1" />
            </li>
          ))}
      </ul>

      <section aria-labelledby="results-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="results-heading" className="text-xl text-ink">
              Results
            </h2>
            <p className="text-sm text-ink-muted">
              Low, central and high outcomes against a no-disruption baseline.
            </p>
          </div>
          <HorizonSwitch value={horizon} onChange={setHorizon} horizons={r.result.horizons} />
        </div>
        <div className="mb-3">
          <RangeLegend />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <FadeSwap key={horizon}>
            <StaggerGroup className="grid gap-5 2xl:grid-cols-2">
              {GROUPS.map((g) => (
                <StaggerBlock key={g.key}>
                  <Panel aria-labelledby={`grp-${g.key}`} className="h-full">
                    <PanelHeader
                      id={`grp-${g.key}`}
                      title={g.label}
                      description={`${g.description} ${horizonLabel}.`}
                    />
                    <ul className="divide-y divide-line border-t border-line">
                      {r.metricDefs
                        .filter((m) => m.group === g.key)
                        .map((m) => (
                          <MetricRow
                            key={m.key}
                            def={m}
                            run={r}
                            horizon={horizon}
                            onCalc={() => setCalc(m)}
                          />
                        ))}
                    </ul>
                  </Panel>
                </StaggerBlock>
              ))}
            </StaggerGroup>
          </FadeSwap>
        </AnimatePresence>

        <Panel aria-labelledby="compare-heading" className="mt-5 overflow-x-auto">
          <PanelHeader
            id="compare-heading"
            title="Compare horizons"
            description="Central value, with the low-to-high range beneath."
          />
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="sr-only">Central values and ranges for every metric at every horizon</caption>
            <thead>
              <tr className="border-y border-line bg-raised/50 text-xs text-ink-muted">
                <th scope="col" className="px-5 py-2 text-start font-medium">
                  Metric
                </th>
                {r.result.horizons.map((h) => (
                  <th key={h.key} scope="col" className="px-3 py-2 text-end font-medium">
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-line">
              {r.metricDefs.map((m) => {
                const values = r.result.metrics.find((x) => x.key === m.key)!.values;
                return (
                  <tr key={m.key}>
                    <th scope="row" className="px-5 py-2 text-start font-normal text-ink">
                      {m.label}
                      <span className="block text-xs text-ink-faint">{m.unit}</span>
                    </th>
                    {r.result.horizons.map((h) => {
                      const v = values[h.key];
                      return (
                        <td key={h.key} className="px-3 py-2 text-end align-top">
                          <span className="font-semibold text-ink">
                            {formatScenarioValue(v.central, null, m.decimals)}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {formatScenarioValue(v.low, null, m.decimals)}–
                            {formatScenarioValue(v.high, null, m.decimals)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </section>

      <section aria-labelledby="options-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="options-heading" className="text-xl text-ink">
              Draft options
            </h2>
            <p className="text-sm text-ink-muted">
              Ranked by a published rule for expert review. None is approved; recording a decision arrives in
              Phase 4.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <Gavel className="h-3.5 w-3.5 text-gold-bright" aria-hidden />
            Created by {r.createdBy}, who can never approve them
          </span>
        </div>
        <StaggerList className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {r.options.map((o) => (
            <StaggerItem key={o.id}>
              <OptionCard option={o} />
            </StaggerItem>
          ))}
        </StaggerList>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel aria-labelledby="mandate-heading">
            <PanelHeader
              id="mandate-heading"
              icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
              title="Mandate checks"
              description="Apply to every option in this run."
            />
            <div className="border-t border-line px-5 py-1">
              <MandateChecks checks={r.options[0]?.mandateChecks ?? []} />
            </div>
          </Panel>
          {r.confidence ? (
            <Panel aria-labelledby="confidence-heading">
              <PanelHeader
                id="confidence-heading"
                title="Confidence"
                description="A band with its basis — never a single score."
              />
              <div className="border-t border-line px-5 py-4">
                <ConfidenceBasisList confidence={r.confidence} />
              </div>
            </Panel>
          ) : null}
        </div>
      </section>

      <Panel aria-labelledby="drafts-heading" className="mt-8">
        <PanelHeader
          id="drafts-heading"
          icon={<Bot className="h-4 w-4" aria-hidden />}
          title="Specialist drafts"
          description="Prose drafted by the internal deterministic stub from cited values only. Every number is checked against its citations."
        />
        <div className="divide-y divide-line border-t border-line px-5">
          {specialistRuns.map((a) => (
            <AgentDraft key={a.id} run={a} />
          ))}
        </div>
      </Panel>

      <CalcSheet
        run={r}
        metric={calc}
        onClose={() => setCalc(null)}
        onEvidence={(evidenceId, predicate) => {
          setCalc(null);
          setLineage({ evidenceId, fact: null, predicate });
        }}
      />
      <LineageDrawer target={lineage} onClose={() => setLineage(null)} />
    </>
  );
}
