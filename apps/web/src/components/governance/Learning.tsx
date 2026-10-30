/**
 * Learning loop (Phase 5D, FR-55): proposals from missed outcomes, decided by a domain expert; every assumption's
 * versions; and calibration (held and missed counts) per assumption and per engine. Counts always accompany a rate.
 */
import type { AssumptionProposalItem, LearningOverview } from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, GraduationCap, History, XCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { LoadState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/data';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ApiError, api } from '@/lib/api';
import { formatRelative } from '@/lib/format';

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';
const n = (v: number) => Number(v.toFixed(4)).toString();

function ProposalStatus({ p }: { p: AssumptionProposalItem }) {
  const stale = p.status === 'proposed' && p.baseVersion < p.currentVersion;
  const [tone, Icon, label] =
    p.status === 'approved'
      ? (['ok', CheckCircle2, `Approved as version ${p.newVersion}`] as const)
      : p.status === 'rejected'
        ? (['low', XCircle, 'Rejected'] as const)
        : stale
          ? (['medium', History, `Outdated: made against version ${p.baseVersion}`] as const)
          : (['awaiting', CircleDashed, 'Awaiting a domain expert'] as const);
  return (
    <StatusPill tone={tone}>
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
    </StatusPill>
  );
}

function Decide({ p }: { p: AssumptionProposalItem }) {
  const id = useId();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: (action: 'approve' | 'reject') => api.decideProposal(p.key, action, note),
    onSettled: () => qc.invalidateQueries({ queryKey: ['learning'] }),
  });
  if (p.mine)
    return (
      <p className="mt-2 text-xs text-ink-muted">
        You recorded the outcome review behind this; another domain expert decides.
      </p>
    );
  const stale = p.baseVersion < p.currentVersion;
  return (
    <div className="mt-3 grid gap-2 border-t border-line pt-3">
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-n`}>
        Note (recorded)
        <input id={`${id}-n`} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={m.isPending || stale || note.trim().length < 10}
          onClick={() => m.mutate('approve')}
        >
          Approve new version
        </Button>
        <Button
          size="sm"
          disabled={m.isPending || note.trim().length < 10}
          onClick={() => m.mutate('reject')}
        >
          Reject
        </Button>
      </div>
      {m.error ? (
        <p role="alert" className="text-xs text-red">
          {m.error instanceof ApiError && m.error.code === 'stale'
            ? 'The assumption has changed since this was proposed. Reject it; a new miss proposes against the current version.'
            : 'Not recorded. Try again.'}
        </p>
      ) : null}
    </div>
  );
}

function Proposals({ data }: { data: LearningOverview }) {
  return (
    <Panel aria-labelledby="proposals-heading">
      <PanelHeader
        id="proposals-heading"
        icon={<GraduationCap className="h-4 w-4" aria-hidden />}
        title="Proposed assumption versions"
        description={`Raised by ${data.version} when an outcome misses its expected range. The central value is kept and the range widened by the size of the miss; nothing changes until a domain expert approves.`}
      />
      {data.proposals.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {data.proposals.map((p) => (
            <li key={p.key} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <ProposalStatus p={p} />
                <span className="tabular text-xs text-ink-faint">{p.key}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-ink">
                {p.assumptionKey}:{' '}
                <span className="tabular">
                  {n(p.low)} – {n(p.central)} – {n(p.high)}
                </span>
                <span className="font-normal text-ink-muted">
                  {' '}
                  (low – central – high, from version {p.baseVersion})
                </span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">{p.basis}</p>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-faint">
                <span>From outcome review {p.outcomeReviewKey}</span>
                {p.caseKey ? (
                  <Link className="text-brand underline-offset-2 hover:underline" to={`/cases/${p.caseKey}`}>
                    Case {p.caseKey}
                  </Link>
                ) : (
                  <span>On a case outside your read scope</span>
                )}
                <span>Proposed {formatRelative(p.createdAt)}</span>
              </p>
              {p.decidedBy ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {p.status === 'approved' ? 'Approved' : 'Rejected'} by {p.decidedBy}: {p.decisionNote}
                </p>
              ) : null}
              {data.canDecide && p.status === 'proposed' ? <Decide p={p} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
          No proposals. One appears when an outcome review finds an outcome outside its expected range.
        </p>
      )}
    </Panel>
  );
}

function Calibration({ data }: { data: LearningOverview }) {
  return (
    <Panel aria-labelledby="calibration-heading">
      <PanelHeader
        id="calibration-heading"
        title="Calibration"
        description="How often reviewed outcomes of figures that depend on each assumption fell within their expected range. Counts are shown with every rate; a few reviews are not evidence of calibration."
      />
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="bg-raised text-xs text-ink-muted">
              <th scope="col" className="px-5 py-2 text-start font-semibold">
                Assumption
              </th>
              <th scope="col" className="px-3 py-2 text-start font-semibold">
                Current range
              </th>
              <th scope="col" className="px-3 py-2 text-start font-semibold">
                Versions
              </th>
              <th scope="col" className="px-3 py-2 text-start font-semibold">
                Held / missed
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.assumptions.map((a) => {
              const v = a.versions[0]!;
              const c = a.calibration;
              return (
                <tr key={a.key}>
                  <th scope="row" className="px-5 py-3 text-start align-top font-medium text-ink">
                    {a.label}
                    <span className="block text-[12px] font-normal text-ink-faint">{a.key}</span>
                  </th>
                  <td className="tabular px-3 py-3 align-top text-ink">
                    {n(v.low)} – {n(v.central)} – {n(v.high)} {a.unit}
                  </td>
                  <td className="px-3 py-3 align-top text-ink-muted">
                    v{v.version}
                    {a.versions.length > 1 ? ` (${a.versions.length} kept)` : ''}
                  </td>
                  <td className="tabular px-3 py-3 align-top text-ink">
                    {c.held + c.missed ? `${c.held} held / ${c.missed} missed` : 'No reviews yet'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-5 py-3 text-sm text-ink-muted">
        {data.models.length ? (
          <ul className="space-y-1">
            {data.models.map((m) => (
              <li key={m.engine}>
                <span className="text-ink">{m.engine}</span>:{' '}
                <span className="tabular">
                  {m.held} held / {m.missed} missed
                </span>
              </li>
            ))}
          </ul>
        ) : (
          'No outcome reviews yet, so no engine has a track record.'
        )}
      </div>
    </Panel>
  );
}

export function LearningView() {
  const q = useQuery({ queryKey: ['learning'], queryFn: api.learning });
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  return (
    <div className="grid gap-6">
      <Proposals data={q.data} />
      <Calibration data={q.data} />
    </div>
  );
}
