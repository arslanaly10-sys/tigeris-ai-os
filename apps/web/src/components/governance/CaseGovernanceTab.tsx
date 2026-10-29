import { DECIDING_ROLES, HANDOFF_ROLES } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { Gavel, Info } from 'lucide-react';
import { LoadState } from '@/components/PageHeader';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { useAuthContext } from '@/lib/session';
import {
  DecisionForm,
  GovernanceSteps,
  HandoffCard,
  MemoryCard,
  RecommendationCard,
  RecommendForm,
  ReviewForm,
} from './parts';

function Notice({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-sm text-ink-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** The case's governed path: recommendation, mandatory expert review, decision, handoff and memory. */
export function CaseGovernanceTab({ caseKey }: { caseKey: string }) {
  const auth = useAuthContext();
  const q = useQuery({ queryKey: ['governance', caseKey], queryFn: () => api.governance(caseKey) });
  if (!q.data || !auth.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const g = q.data;
  const roles = auth.data.principal.roles;
  const decides = DECIDING_ROLES.some((r) => roles.includes(r));
  const operates = HANDOFF_ROLES.some((r) => roles.includes(r));
  const past = g.recommendations.filter((r) => r.id !== g.open?.id && r.key !== g.handoff?.recommendationKey);
  const approved = g.recommendations.find((r) => r.key === g.handoff?.recommendationKey);

  return (
    <div className="space-y-6">
      <GovernanceSteps g={g} />

      {g.memory ? (
        <section aria-label="Institutional memory" className="space-y-2">
          <h2 className="text-lg text-ink">Kept as institutional memory</h2>
          <MemoryCard m={g.memory} showCase={false} />
        </section>
      ) : null}

      {g.handoff ? (
        <section aria-label="Handoff" className="space-y-2">
          <h2 className="text-lg text-ink">Handoff to operations</h2>
          <HandoffCard h={g.handoff} canAct={operates} />
          {!operates && g.handoff.status !== 'completed' ? (
            <p className="text-sm text-ink-muted">
              Only the Operations Owner records acknowledgement, progress and outcome.
            </p>
          ) : null}
        </section>
      ) : null}

      {g.open ? (
        <section aria-label="Open recommendation" className="space-y-2">
          <h2 className="text-lg text-ink">
            {g.open.status === 'in_review' ? 'Awaiting expert review' : 'Awaiting decision'}
          </h2>
          <RecommendationCard rec={g.open}>
            {g.open.status === 'in_review' ? (
              g.canReview.allowed ? (
                <ReviewForm rec={g.open} />
              ) : (
                <Notice>{g.canReview.reason}</Notice>
              )
            ) : g.decisionPreview && decides ? (
              <DecisionForm rec={g.open} preview={g.decisionPreview} />
            ) : (
              <Notice>
                A decision is recorded by the named authority: an Expert Approver, or an Executive / Governor
                where the matrix requires.
              </Notice>
            )}
          </RecommendationCard>
        </section>
      ) : null}

      {approved && !g.open ? (
        <section aria-label="Approved recommendation" className="space-y-2">
          <h2 className="text-lg text-ink">Approved recommendation</h2>
          <RecommendationCard rec={approved} />
        </section>
      ) : null}

      {!g.open && !g.handoff && g.caseState !== 'closed' ? (
        <Panel aria-labelledby="recommend-heading">
          <PanelHeader
            id="recommend-heading"
            icon={<Gavel className="h-4 w-4" aria-hidden />}
            title="Recommend an option"
            description="One option from the latest scenario run goes forward for mandatory expert review. The person who recommends it can never review or decide on it."
          />
          <div className="border-t border-line px-5 py-4">
            {g.canRecommend.allowed ? (
              <RecommendForm g={g} />
            ) : (
              <p className="text-sm text-ink-muted">{g.canRecommend.reason}</p>
            )}
          </div>
        </Panel>
      ) : null}

      {past.length ? (
        <section aria-label="Earlier recommendations" className="space-y-2">
          <h2 className="text-lg text-ink">Earlier recommendations</h2>
          {past.map((r) => (
            <RecommendationCard key={r.id} rec={r} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
