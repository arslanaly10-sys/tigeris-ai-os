/**
 * Case analysis (slice F, FR-34). Eight read-only agents work through the case's authorized records and draft
 * through the model gateway; every number in their prose is a cited input. A step without enough records shows a
 * gap, never an answer. Running an analysis changes nothing on the case beyond recording the run.
 */
import type { AnalysisStepItem, CaseAnalysisPayload } from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CircleCheck, CircleDashed, ShieldCheck } from 'lucide-react';
import { LoadState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

function StepStatus({ status }: { status: AnalysisStepItem['status'] }) {
  return status === 'gap' ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-amber/50 bg-amber-soft px-1.5 py-0.5 text-xs font-medium text-amber">
      <CircleDashed className="h-3.5 w-3.5" aria-hidden />
      Gap reported
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald/40 bg-emerald-soft px-1.5 py-0.5 text-xs font-medium text-emerald">
      <CircleCheck className="h-3.5 w-3.5" aria-hidden />
      Answered
    </span>
  );
}

function Step({ s, n }: { s: AnalysisStepItem; n: number }) {
  const numbers = s.grounding.numbers.length;
  return (
    <li className="rounded-xl border border-line bg-panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-xs text-ink-faint">Step {n}</span>
        <h3 className="text-base text-ink">{s.agentName}</h3>
        <StepStatus status={s.status} />
      </div>
      <div className="mt-2 grid gap-x-8 gap-y-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <p className={cn('max-w-prose text-sm', s.status === 'gap' ? 'text-ink-muted' : 'text-ink')}>
          {s.text}
        </p>
        {s.findings.length ? (
          <ul className="list-disc space-y-0.5 ps-5 text-sm text-ink xl:border-s xl:border-line xl:ps-8">
            {s.findings.slice(0, 8).map((f) => (
              <li key={f}>{f}</li>
            ))}
            {s.findings.length > 8 ? (
              <li className="text-ink-muted">and {s.findings.length - 8} more</li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <details className="mt-3 text-xs text-ink-muted">
        <summary className="cursor-pointer font-medium text-cyan">
          {s.citations.length} cited {s.citations.length === 1 ? 'input' : 'inputs'} ·{' '}
          {numbers
            ? `all ${numbers} ${numbers === 1 ? 'number' : 'numbers'} cited`
            : 'no numbers in the text'}{' '}
          · {s.modelId} {s.modelVersion}
        </summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[12rem_minmax(0,1fr)]">
          {s.citations.map((c) => (
            <div key={c.ref} className="contents">
              <dt className="text-ink-faint">{c.label}</dt>
              <dd className="break-words text-ink">{c.display}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-ink-faint">
          Template {s.templateKey} {s.templateVersion}. The gateway refuses any draft containing a number that
          is not in a cited input.
        </p>
      </details>
    </li>
  );
}

function GatewayNote({ g }: { g: CaseAnalysisPayload['gateway'] }) {
  return (
    <p className="flex items-start gap-2 text-sm text-ink-muted">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
      <span>
        Drafted by the internal deterministic stub. External model provider:{' '}
        {g.external.configured
          ? `configured (${g.external.endpointHost}) and switched off`
          : 'not configured'}
        . {g.external.reason}
      </span>
    </p>
  );
}

export function CaseAnalysisTab({ caseKey }: { caseKey: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['analysis', caseKey], queryFn: () => api.caseAnalysis(caseKey) });
  const run = useMutation({
    mutationFn: () => api.runAnalysis(caseKey),
    onSuccess: () => qc.invalidateQueries(),
  });
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const d = q.data;
  const latest = d.runs[0];
  return (
    <div className="space-y-6">
      <Panel aria-labelledby="analysis-heading">
        <PanelHeader
          id="analysis-heading"
          icon={<Bot className="h-4 w-4" aria-hidden />}
          title="Case analysis"
          description="A planner and seven specialist agents read only the records this case may use and draft what they find. They cannot change the case, approve anything or reach outside TIGERIS."
          action={
            d.canRun ? (
              <Button variant="primary" onClick={() => run.mutate()} disabled={run.isPending}>
                {run.isPending ? 'Running…' : latest ? 'Run again' : 'Run analysis'}
              </Button>
            ) : null
          }
        />
        <div className="space-y-3 border-t border-line px-5 py-4">
          {latest ? (
            <p className="text-sm text-ink">
              <span className="tabular font-medium">{latest.key}</span> · {latest.version} ·{' '}
              {latest.createdBy} · {formatDateTime(latest.createdAt)}
              {latest.scenarioKey ? ` · reads ${latest.scenarioKey}` : ' · no scenario run yet'} ·{' '}
              <span className={latest.gapCount ? 'font-medium text-amber' : undefined}>
                {latest.gapCount} {latest.gapCount === 1 ? 'gap' : 'gaps'}
              </span>
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              No analysis has been run for this case.
              {d.canRun ? '' : ' An Intelligence Analyst or Domain Expert starts one.'}
            </p>
          )}
          {run.error ? (
            <p role="alert" className="text-sm text-red">
              {run.error instanceof ApiError && run.error.code === 'case_closed'
                ? 'This case is closed; no further analysis is recorded.'
                : 'The analysis could not be recorded. Nothing was changed.'}
            </p>
          ) : null}
          <GatewayNote g={d.gateway} />
        </div>
      </Panel>

      {latest ? (
        <section aria-label="Analysis steps">
          <ol className="space-y-3">
            {latest.steps.map((s, i) => (
              <Step key={s.agentKey} s={s} n={i + 1} />
            ))}
          </ol>
        </section>
      ) : (
        <Panel aria-labelledby="roster-heading">
          <PanelHeader id="roster-heading" title="Agents in a run" />
          <ul className="divide-y divide-line border-t border-line">
            {d.agents.map((a) => (
              <li key={a.key} className="px-5 py-3">
                <p className="text-sm font-medium text-ink">{a.name}</p>
                <p className="text-xs text-ink-muted">
                  {a.does}. Reads: {a.tools.join(', ')}.
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {d.runs.length > 1 ? (
        <p className="text-sm text-ink-muted">
          Earlier runs, kept unchanged:{' '}
          {d.runs
            .slice(1)
            .map(
              (r) =>
                `${r.key} (${formatDateTime(r.createdAt)}, ${r.gapCount} ${r.gapCount === 1 ? 'gap' : 'gaps'})`,
            )
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
