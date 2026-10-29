import { useQuery } from '@tanstack/react-query';
import { GitFork, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { LoadState } from '@/components/PageHeader';
import {
  ConfidenceBasisList,
  MandateChecks,
  OptionCard,
  SEVERITY_TONE,
  severityLabel,
} from '@/components/scenario/Drafts';
import { DataModeBadge } from '@/components/truth/badges';
import { buttonVariants } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/data';
import { StaggerItem, StaggerList } from '@/components/ui/motion';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';

function NewScenarioLink({ caseKey }: { caseKey: string }) {
  const setup = useQuery({ queryKey: ['scenario-setup'], queryFn: api.scenarioSetup });
  if (!setup.data?.canRun) return null;
  return (
    <Link
      to={`/scenarios/new?case=${encodeURIComponent(caseKey)}`}
      className={buttonVariants({ variant: 'primary', size: 'sm' })}
    >
      <Plus className="h-4 w-4" aria-hidden />
      New scenario for this case
    </Link>
  );
}

export function CaseScenariosTab({ caseKey }: { caseKey: string }) {
  const runs = useQuery({ queryKey: ['scenarios', caseKey], queryFn: () => api.scenarios(caseKey) });
  return (
    <Panel aria-labelledby="case-scenarios-heading">
      <PanelHeader
        id="case-scenarios-heading"
        icon={<GitFork className="h-4 w-4" aria-hidden />}
        title="Scenario runs for this case"
        description="Baseline and what-if comparisons across 72 hours, 90 days, one year and five years."
        action={<NewScenarioLink caseKey={caseKey} />}
      />
      <LoadState isPending={runs.isPending} error={runs.error} />
      {runs.data ? (
        runs.data.length === 0 ? (
          <p className="border-t border-line px-5 py-6 text-sm text-ink-muted">
            No scenario has been run for this case yet.
          </p>
        ) : (
          <StaggerList className="divide-y divide-line border-t border-line">
            {runs.data.map((r) => (
              <StaggerItem key={r.id}>
                <Link to={`/scenarios/${r.key}`} className="block px-5 py-3 hover:bg-raised/60">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-[12px] text-ink-faint">{r.key}</span>
                    <DataModeBadge value="scenario" />
                    {r.severity ? (
                      <StatusPill tone={SEVERITY_TONE[r.severity]}>{severityLabel(r.severity)}</StatusPill>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-ink">{r.title}</span>
                  <span className="text-[12px] text-ink-faint">
                    {r.createdBy} · {formatRelative(r.createdAt)}
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </StaggerList>
        )
      ) : null}
    </Panel>
  );
}

/** Draft options from the case's latest scenario run. Review and decision arrive in Phase 4. */
export function CaseOptionsTab({ caseKey }: { caseKey: string }) {
  const runs = useQuery({ queryKey: ['scenarios', caseKey], queryFn: () => api.scenarios(caseKey) });
  const latest = runs.data?.[0]?.key;
  const run = useQuery({
    queryKey: ['scenario', latest],
    queryFn: () => api.scenario(latest!),
    enabled: !!latest,
  });
  if (runs.isPending || (latest && run.isPending)) return <LoadState isPending error={null} />;
  if (!latest)
    return (
      <Panel className="px-5 py-8 text-center">
        <p className="text-sm font-medium text-ink">No draft options yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-ink-muted">
          Options are drafted from a scenario run. Run a scenario for this case to see ranked options for
          expert review.
        </p>
        <div className="mt-3 flex justify-center">
          <NewScenarioLink caseKey={caseKey} />
        </div>
      </Panel>
    );
  if (!run.data) return <LoadState isPending={false} error={run.error} />;
  const r = run.data;
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">
        From the latest run{' '}
        <Link
          to={`/scenarios/${r.key}`}
          className="inline-flex min-h-6 items-center font-medium text-cyan hover:underline"
        >
          {r.key}
        </Link>{' '}
        · {r.title}. Drafts for expert review; none is approved.
      </p>
      <StaggerList className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {r.options.map((o) => (
          <StaggerItem key={o.id}>
            <OptionCard option={o} />
          </StaggerItem>
        ))}
      </StaggerList>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel aria-labelledby="case-mandates-heading">
          <PanelHeader id="case-mandates-heading" title="Mandate checks" />
          <div className="border-t border-line px-5 py-1">
            <MandateChecks checks={r.options[0]?.mandateChecks ?? []} />
          </div>
        </Panel>
        {r.confidence ? (
          <Panel aria-labelledby="case-opt-confidence-heading">
            <PanelHeader id="case-opt-confidence-heading" title="Confidence in the scenario basis" />
            <div className="border-t border-line px-5 py-4">
              <ConfidenceBasisList confidence={r.confidence} />
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
