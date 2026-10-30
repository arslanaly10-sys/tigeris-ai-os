/**
 * Governance-ready case report (slice I, FR-38). A print view of the evidence pack the API assembles from the same
 * endpoints the screens use, with the reader's own session; opening it is an audited export. Every figure keeps its
 * label (claim class, validation status, assumption) so the printed page carries the same truth as the screen.
 */
import { formatScenarioValue, type CaseReport, type ScenarioInputRef } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { LoadState } from '@/components/PageHeader';
import { ClaimBadge, StateBadge, ValidationBadge } from '@/components/truth/badges';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const id = `report-s${n}`;
  return (
    <section aria-labelledby={id} className="break-inside-avoid-page border-t border-line pt-5">
      <h2 id={id} className="text-lg text-ink">
        <span className="tabular me-2 text-ink-faint">{n}.</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm text-ink">{children}</div>
    </section>
  );
}

const assumptionsOf = (inputs: ScenarioInputRef[]) =>
  inputs.filter((i): i is Extract<ScenarioInputRef, { kind: 'assumption' }> => i.kind === 'assumption');

function Report({ r }: { r: CaseReport }) {
  const c = r.case;
  const g = r.governance;
  const s = r.scenario;
  const gaps = r.analysis?.steps.filter((x) => x.status === 'gap') ?? [];
  const byHop = new Map<number, string[]>();
  for (const n of r.graph.nodes) byHop.set(n.hop ?? 0, [...(byHop.get(n.hop ?? 0) ?? []), n.name]);
  const name = new Map(r.graph.nodes.map((n) => [n.id, n.name]));
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p
          role="note"
          className="rounded-md border border-gold/40 bg-gold-soft px-3 py-2 text-sm font-medium text-gold-bright"
        >
          {r.label}
        </p>
        <p className="tabular text-sm text-ink-muted">
          {r.institution.name} · {c.key} · {r.version}
        </p>
        <h1 className="text-2xl text-ink sm:text-3xl">{c.title}</h1>
        <p className="text-sm text-ink-muted">
          Generated {formatDateTime(r.generatedAt)} for {r.generatedBy.name} ({r.generatedBy.title};{' '}
          {r.generatedBy.roles.map((x) => ROLE_LABEL[x]).join(', ')}). Contains only records this person may
          open.
        </p>
        <p className="break-all font-mono text-xs text-ink-faint">Content SHA-256 {r.contentHash}</p>
      </header>

      <Section n={1} title="Executive summary">
        <p className="flex flex-wrap items-center gap-2">
          <StateBadge value={c.state} /> <span>{humanize(c.urgency)} urgency</span> ·{' '}
          <span>{humanize(c.sensitivity)}</span> · <span>{c.domain}</span>
        </p>
        <p>
          <strong>Objective.</strong> {c.objective}
        </p>
        <p>{c.summary}</p>
        <p>
          <strong>Why it matters.</strong> {c.whyItMatters}
        </p>
        <p>
          <strong>Confidence: {humanize(c.confidence.band)}.</strong>{' '}
          {c.confidence.factors.map((f) => `${humanize(f.factor)} ${f.band}: ${f.note}`).join(' · ') ||
            'No factors recorded.'}
        </p>
      </Section>

      <Section n={2} title="What changed and when">
        <ol className="space-y-1">
          {c.events.map((e) => (
            <li key={e.id}>
              <span className="tabular text-ink-muted">{formatDateTime(e.occurredAt)}</span> · {e.actor} ·{' '}
              {humanize(e.eventType)}
              {e.toState ? ` → ${humanize(e.toState)}` : ''}
              {e.rationale ? `: ${e.rationale}` : ''}
            </li>
          ))}
        </ol>
      </Section>

      <Section n={3} title="Affected entities and dependency paths">
        {r.graph.nodes.length === 0 ? (
          <p className="text-ink-muted">No entities are linked to this case.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {[...byHop.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([hop, names]) => (
                  <li key={hop}>
                    <strong>{hop === 0 ? 'Origin' : `${hop} ${hop === 1 ? 'step' : 'steps'} out`}:</strong>{' '}
                    {names.join(', ')}
                  </li>
                ))}
            </ul>
            <ul className="space-y-1">
              {r.graph.edges.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {name.get(e.source)} {e.predicate} {name.get(e.target)}
                  </span>
                  <ClaimBadge value={e.relationshipClass} />
                  <span className="text-ink-muted">
                    {humanize(e.confidenceBand)} confidence · {e.evidence.length} evidence
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section n={4} title="Evidence and timestamps">
        {c.evidence.length === 0 ? (
          <p className="text-ink-muted">No evidence is linked to this case.</p>
        ) : (
          <ul className="space-y-2">
            {c.evidence.map((e) => (
              <li key={e.id}>
                <p className="flex flex-wrap items-center gap-2">
                  <strong>{e.title}</strong> <ValidationBadge value={e.validationStatus} />
                </p>
                <p className="text-ink-muted">
                  {e.source.publisher} · event {e.eventTime ? formatDateTime(e.eventTime) : 'not stated'} ·
                  retrieved {e.retrievedAt ? formatDateTime(e.retrievedAt) : 'not recorded'} · version{' '}
                  {e.version}
                  {e.validationNote ? ` · ${e.validationNote}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section n={5} title="Assumptions and gaps">
        {c.unresolvedQuestions.length ? (
          <ul className="list-disc space-y-0.5 ps-5">
            {c.unresolvedQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">No open questions recorded.</p>
        )}
        {s ? (
          <ul className="space-y-0.5">
            {assumptionsOf(s.inputs).map((a) => (
              <li key={a.ref} className="flex flex-wrap items-center gap-2">
                <ClaimBadge value="assumed" />
                {a.label}: {formatScenarioValue(a.central, a.unit, 2)} (range{' '}
                {formatScenarioValue(a.low, a.unit, 2)} to {formatScenarioValue(a.high, a.unit, 2)})
              </li>
            ))}
          </ul>
        ) : null}
        {gaps.length ? (
          <p>
            <strong>Gaps reported by the latest analysis ({r.analysis!.key}):</strong>{' '}
            {gaps.map((x) => `${x.agentName}: ${x.gaps.join('; ')}`).join(' · ')}
          </p>
        ) : null}
      </Section>

      <Section n={6} title="Scenario impacts">
        {s ? (
          <>
            <p className="text-ink-muted">
              {s.key} · engine {s.engineVersion} · input hash {s.inputHash.slice(0, 16)}… · illustrative
              scenario, not a forecast
            </p>
            <ul className="space-y-0.5">
              {s.result.metrics.map((m) => {
                const def = s.metricDefs.find((d) => d.key === m.key)!;
                const v = m.values.d90;
                const f = (n: number) => formatScenarioValue(n, def.unit, def.decimals);
                return (
                  <li key={m.key}>
                    {def.label} (90 days): <strong className="tabular">{f(v.central)}</strong>{' '}
                    <span className="tabular text-ink-muted">
                      range {f(v.low)} to {f(v.high)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-ink-muted">No scenario has been run for this case.</p>
        )}
      </Section>

      <Section n={7} title="Options, mandate and policy checks">
        {g.candidateOptions.length ? (
          <ol className="space-y-2">
            {g.candidateOptions.map((o) => (
              <li key={o.id}>
                <strong>
                  {o.rank}. {o.title}
                </strong>
                <span className="block text-ink-muted">{o.rankBasis}</span>
                <span className="block text-ink-muted">
                  {o.mandateChecks.map((m) => `${m.mandateKey} ${m.status}`).join(' · ') ||
                    'No mandate checks'}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-ink-muted">No options drafted.</p>
        )}
      </Section>

      <Section n={8} title="Reviews, disagreements and decisions">
        {g.recommendations.length === 0 ? (
          <p className="text-ink-muted">No recommendation has been made.</p>
        ) : (
          g.recommendations.map((rec) => (
            <div key={rec.id} className="space-y-1">
              <p>
                <strong>
                  {rec.key}: {rec.option.title}
                </strong>{' '}
                · {humanize(rec.status)} · by {rec.createdBy.name}: {rec.rationale}
              </p>
              {rec.reviews.map((v) => (
                <p key={v.id} className="ps-4">
                  Review by {v.reviewer.name}: {humanize(v.verdict)}. {v.rationale}
                </p>
              ))}
              {g.notes
                .filter((n) => n.recommendationKey === rec.key)
                .map((n) => (
                  <p key={n.id} className="ps-4">
                    {n.stance === 'disagree' ? 'Disagreement' : n.stance === 'agree' ? 'Agreement' : 'Note'}{' '}
                    by {n.author} ({ROLE_LABEL[n.authorRole]}): {n.body}
                  </p>
                ))}
              {rec.decisions.map((d) => (
                <p key={d.id} className="ps-4">
                  {d.key}: {humanize(d.outcome)} by {d.approver.name}, {formatDateTime(d.createdAt)} ·{' '}
                  {d.policyVersion} {d.policyResult}. {d.rationale}
                </p>
              ))}
            </div>
          ))
        )}
      </Section>

      <Section n={9} title="Actions and outcome">
        {g.handoff ? (
          <p>
            {g.handoff.key} to operations: {humanize(g.handoff.status)}. {g.handoff.scope}
            {g.handoff.outcomeText ? ` Outcome: ${g.handoff.outcomeText}` : ''} No action was executed by
            TIGERIS.
          </p>
        ) : (
          <p className="text-ink-muted">No handoff yet.</p>
        )}
        {g.memory ? (
          <p>
            Lesson kept as {g.memory.key}: {g.memory.lesson}
          </p>
        ) : null}
        {r.outcomes ? (
          <p>
            Outcome review: {r.outcomes.summary.reviewed} of {r.outcomes.summary.total} figures reviewed,{' '}
            {r.outcomes.summary.held} held, {r.outcomes.summary.missed} missed,{' '}
            {r.outcomes.summary.notComparable} not comparable.
          </p>
        ) : null}
      </Section>
    </article>
  );
}

export function CaseReportPage() {
  const { key = '' } = useParams();
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['report', key], queryFn: () => api.caseReport(key), staleTime: Infinity });
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/cases/${key}`} className="text-sm text-cyan hover:underline">
          ← {key}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()} disabled={!q.data}>
            <Printer className="h-4 w-4" aria-hidden />
            {t('report.print')}
          </Button>
          <a
            href={`/api/cases/${encodeURIComponent(key)}/report?format=json&download=true`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-panel px-4 text-sm text-ink hover:border-brand/50 hover:bg-raised"
          >
            <Download className="h-4 w-4" aria-hidden />
            {t('report.download')}
          </a>
        </div>
      </div>
      {q.error instanceof ApiError && q.error.status === 403 ? (
        <p className="rounded-xl border border-line bg-panel px-5 py-6 text-sm text-ink-muted">
          Case reports are exported by the Executive, Analyst, Domain Expert, Expert Approver and Auditor.
          Every export is recorded in the audit log.
        </p>
      ) : q.data ? (
        <div className="rounded-xl border border-line bg-panel px-6 py-6 print:border-0 print:px-0">
          <Report r={q.data} />
        </div>
      ) : (
        <LoadState isPending={q.isPending} error={q.error} />
      )}
    </div>
  );
}
