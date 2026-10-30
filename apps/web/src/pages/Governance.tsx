/**
 * AI Command, Mandates & Authority, Decisions & Approvals and Governed Execution.
 * Each shows recorded institutional state only; nothing here executes an action (CLAUDE.md §6).
 */
import type { AuthContext, CaseState } from '@tigeris/shared';
import { HANDOFF_ROLES, SECTORS } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { Ban, Bot, Check, Cpu, Gavel, Handshake, Lock, ShieldCheck, UserCheck, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { AgentDraft } from '@/components/scenario/Drafts';
import { Sheet } from '@/components/ui/sheet';
import { ClaimBadge, StateBadge, UrgencyBadge } from '@/components/truth/badges';
import { StatusPill } from '@/components/ui/data';
import { StaggerItem, StaggerList } from '@/components/ui/motion';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { useAgentRunStats, runsLabel, type AgentRunItem } from '@/lib/agents';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { SECTOR_LABEL_AR, useI18n } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';
import { AttentionRow } from '@/pages/Overview';
import { HandoffCard, OUTCOME_LABEL, PolicyResultBadge, RecStatusPill } from '@/components/governance/parts';

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="mb-5 flex items-start gap-2.5 rounded-lg border border-line-strong bg-raised px-4 py-3 text-sm text-ink-muted">
      <span className="mt-0.5 shrink-0 text-gold-bright">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

function YesNo({ value, yes, no }: { value: boolean; yes: string; no: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-emerald">
      <Check className="h-3.5 w-3.5" aria-hidden />
      {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      <X className="h-3.5 w-3.5" aria-hidden />
      {no}
    </span>
  );
}

/** Agent operations console: the per-sector specialist registry, the model policy and every recorded run. */
export function AiCommandPage() {
  const { t, lang } = useI18n();
  const { query, stats } = useAgentRunStats();
  const [open, setOpen] = useState<AgentRunItem | null>(null);
  const runs = query.data ?? [];
  const total = SECTORS.reduce((n, s) => n + s.agents.length, 0);
  const grounded = runs.filter((r) => r.grounding.passed).length;
  return (
    <>
      <PageHeader
        title={t('nav.ai')}
        description="Registered AI specialists per sector, the model policy they run under, and their recorded runs."
        lastUpdated={runs[0]?.startedAt ?? null}
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Panel className="p-5">
          <p className="text-xs font-semiboldr text-ink-faint">Registered specialists</p>
          <p className="tabular mt-1 font-serif text-3xl font-semibold text-ink">{total}</p>
          <p className="text-xs text-ink-muted">
            Across {SECTORS.length} sector configurations · {stats.size} have recorded runs
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs font-semiboldr text-ink-faint">Model gateway</p>
          <p className="mt-1 flex items-center gap-2 text-base font-semibold text-ink">
            <Cpu className="h-4 w-4 text-brand" aria-hidden />
            Deterministic stub only
          </p>
          <p className="text-xs text-ink-muted">
            External model calls are disabled by policy and refused by the database. Models draft prose from
            cited inputs; code computes every quantity.
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs font-semiboldr text-ink-faint">Recorded runs</p>
          <p className="tabular mt-1 font-serif text-3xl font-semibold text-ink">{runs.length}</p>
          <p className="text-xs text-ink-muted">
            {runs.length === 0
              ? 'Runs are recorded when an analyst runs a scenario.'
              : `${grounded} of ${runs.length} passed the grounding check: every number quoted was cited.`}
          </p>
        </Panel>
      </div>

      <Panel aria-labelledby="recent-runs-heading" className="mb-6">
        <PanelHeader
          id="recent-runs-heading"
          icon={<Bot className="h-4 w-4" aria-hidden />}
          title="Recent runs"
          description="Every specialist draft, with the inputs it cited and the model and template versions used."
        />
        <LoadState isPending={query.isPending} error={query.error} />
        {query.data ? (
          runs.length === 0 ? (
            <p className="border-t border-line px-5 py-6 text-sm text-ink-muted">{t('common.noRunsYet')}</p>
          ) : (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[46rem] text-sm">
                <caption className="sr-only">Recorded specialist runs</caption>
                <thead>
                  <tr className="bg-raised/50 text-xs text-ink-muted">
                    <th scope="col" className="px-5 py-2 text-start font-medium">
                      Specialist
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      Task
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      Case · scenario
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      Model
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      Grounding
                    </th>
                    <th scope="col" className="px-5 py-2 text-start font-medium">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {runs.slice(0, 25).map((r) => (
                    <tr key={r.id} className="hover:bg-raised/50">
                      <td className="px-5 py-2.5">
                        <button
                          type="button"
                          onClick={() => setOpen(r)}
                          className="text-start font-medium text-ink hover:underline"
                        >
                          {r.agentName}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">{r.task}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {r.caseKey ? <span className="tabular text-ink-muted">{r.caseKey}</span> : '—'}
                        {r.scenarioKey ? (
                          <Link
                            to={`/scenarios/${r.scenarioKey}`}
                            className="tabular ms-1 text-cyan hover:underline"
                          >
                            {r.scenarioKey}
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-ink-muted">
                        {r.modelId} {r.modelVersion}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span
                          className={
                            r.grounding.passed
                              ? 'inline-flex items-center gap-1 text-emerald'
                              : 'inline-flex items-center gap-1 text-red'
                          }
                        >
                          {r.grounding.passed ? (
                            <Check className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <X className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {r.grounding.passed ? 'Passed' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-ink-muted">{formatRelative(r.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </Panel>

      <Panel aria-labelledby="registry-heading">
        <PanelHeader
          id="registry-heading"
          title="Specialist registry"
          description={`${total} specialists across ${SECTORS.length} sector configurations, with their recorded runs.`}
        />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Registered specialists by sector</caption>
            <thead>
              <tr className="text-[13px] text-ink-muted">
                <th scope="col" className="px-5 py-2 text-start font-normal">
                  Specialist
                </th>
                <th scope="col" className="px-3 py-2 text-start font-normal">
                  What it does
                </th>
                <th scope="col" className="px-5 py-2 text-end font-normal">
                  Recorded runs
                </th>
              </tr>
            </thead>
            {SECTORS.map((s) => (
              <tbody key={s.key} className="border-t border-line">
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={3}
                    className="px-5 pt-3 pb-1 text-start text-[13px] font-semibold text-ink"
                  >
                    <Link to={`/sectors/${s.key}`} className="hover:underline">
                      {lang === 'ar' ? SECTOR_LABEL_AR[s.key] : s.label}
                    </Link>
                  </th>
                </tr>
                {s.agents.map((a) => {
                  const label = runsLabel(stats.get(a.key));
                  return (
                    <tr key={a.key}>
                      <th scope="row" className="px-5 py-2 text-start align-top font-medium text-ink">
                        {a.name}
                      </th>
                      <td className="px-3 py-2 align-top text-ink-muted">{a.description}</td>
                      <td className="px-5 py-2 text-end align-top">
                        {label ? (
                          <StatusPill tone="ok">{label}</StatusPill>
                        ) : (
                          <span className="text-[13px] text-ink-faint">{t('common.noRunsYet')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </Panel>
      <Sheet
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Specialist run"
        description={open ? `${open.agentName} · ${open.task}` : undefined}
      >
        {open ? (
          <div className="px-5">
            <AgentDraft run={open} />
            <p className="pb-4 text-xs text-ink-muted">Policy: {open.policyDecision}</p>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

/** Read-only mandate register and authority matrix (seeded synthetic configuration). */
export function MandatesPage() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['mandates'], queryFn: api.mandates });
  return (
    <>
      <PageHeader
        title={t('nav.mandates')}
        description="The mandates options are checked against, and who may authorise each class of action."
      />
      <Note icon={<Lock className="h-4 w-4" aria-hidden />}>
        Read-only register. Changes go through the governance administrator and are versioned. Values shown
        are a synthetic demonstration configuration.
      </Note>
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        <div className="grid gap-6">
          <Panel aria-labelledby="mandate-heading">
            <PanelHeader
              id="mandate-heading"
              icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
              title="Mandate register"
            />
            <StaggerList className="divide-y divide-line border-t border-line">
              {q.data.mandates.map((m) => (
                <StaggerItem
                  key={m.id}
                  className="grid gap-2 px-5 py-3.5 md:grid-cols-[8rem_minmax(0,1fr)_minmax(0,16rem)]"
                >
                  <span className="tabular text-xs text-ink-faint">{m.key}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{m.title}</span>
                    <span className="block text-xs text-ink-muted">{m.description}</span>
                    <span className="mt-1 block text-[12px] text-ink-faint">
                      {m.category} · Owner: {ROLE_LABEL[m.ownerRole]}
                    </span>
                  </span>
                  <span className="flex flex-col items-start gap-1 text-xs text-ink">
                    {m.limitText}
                    <ClaimBadge value={m.claimClass} />
                  </span>
                </StaggerItem>
              ))}
            </StaggerList>
          </Panel>

          <Panel aria-labelledby="authority-heading">
            <PanelHeader
              id="authority-heading"
              icon={<Gavel className="h-4 w-4" aria-hidden />}
              title="Authority matrix"
              description="Expert review and the self-approval block are enforced in the database for every action class."
            />
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="bg-raised text-start text-xs text-ink-muted">
                    <th scope="col" className="px-5 py-2 text-start font-semibold">
                      Action class
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      Authorised by
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      Threshold
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      Delegated limit
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      Expert review
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      Two-person
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      Self-approval
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {q.data.authority.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="px-5 py-3 text-start align-top font-medium text-ink">
                        {r.actionClass}
                        <span className="block text-xs font-normal text-ink-muted">{r.description}</span>
                      </th>
                      <td className="px-3 py-3 align-top text-ink">{ROLE_LABEL[r.requiredRole]}</td>
                      <td className="px-3 py-3 align-top text-ink-muted">{r.thresholdText}</td>
                      <td className="px-3 py-3 align-top">
                        {r.limits.length ? (
                          <ul className="space-y-0.5">
                            {r.limits.map((l) => (
                              <li key={l.role} className="text-ink">
                                <span className="tabular">
                                  {l.unit === 'days' ? `${l.value} days` : `${l.value} ${l.unit}`}
                                </span>{' '}
                                <span className="text-xs text-ink-muted">· {ROLE_LABEL[l.role]}</span>
                              </li>
                            ))}
                            <li>
                              <ClaimBadge value={r.limits[0]!.claimClass} />
                            </li>
                          </ul>
                        ) : (
                          <span className="text-ink-muted">No numeric limit</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <YesNo value={r.requiresExpertReview} yes="Mandatory" no="Not required" />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <YesNo value={r.twoPerson} yes="Required" no="Single approver" />
                      </td>
                      <td className="px-3 py-3 align-top">
                        {r.selfApprovalBlocked ? (
                          <span className="inline-flex items-center gap-1 text-red">
                            <Ban className="h-3.5 w-3.5" aria-hidden />
                            Blocked
                          </span>
                        ) : (
                          'Allowed'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}

const DECISION_STATES: CaseState[] = ['review', 'decision'];

/** Review and decision queue, the institution's decision log, and what is waiting on the signed-in role. */
export function DecisionsPage({ ctx }: { ctx: AuthContext }) {
  const { t } = useI18n();
  const cases = useQuery({ queryKey: ['cases'], queryFn: api.cases });
  const open = useQuery({ queryKey: ['recommendations', 'open'], queryFn: api.openRecommendations });
  const log = useQuery({ queryKey: ['decisions'], queryFn: api.decisions });
  const pending = useQuery({ queryKey: ['approvals', 'pending'], queryFn: api.pendingApprovals });
  const withRec = new Set((open.data ?? []).map((r) => r.caseKey));
  const awaitingRec = (cases.data ?? []).filter(
    (c) => DECISION_STATES.includes(c.state) && !withRec.has(c.key),
  );
  const role = ctx.principal.roles[0]!;
  return (
    <>
      <PageHeader
        title={t('nav.decisions')}
        description="Recommendations awaiting expert review or a decision, the decision log, and what is waiting on your role."
      />
      <Note icon={<Gavel className="h-4 w-4" aria-hidden />}>
        Every decision is checked by decision-policy 1.0.0: expert review comes first, the author of a
        recommendation never decides on it, the reviewer never approves it, the authority matrix sets the
        role, and two-person actions need a second, different approver.
      </Note>
      <div className="space-y-6">
        <Panel aria-labelledby="queue-heading">
          <PanelHeader
            id="queue-heading"
            icon={<Gavel className="h-4 w-4" aria-hidden />}
            title="Review & decision queue"
          />
          <LoadState isPending={open.isPending} error={open.error} />
          {open.data ? (
            <StaggerList className="divide-y divide-line border-t border-line">
              {open.data.length === 0 && awaitingRec.length === 0 ? (
                <StaggerItem className="px-5 py-4 text-sm text-ink-muted">
                  Nothing is awaiting review or decision.
                </StaggerItem>
              ) : null}
              {open.data.map((r) => (
                <StaggerItem key={r.id}>
                  <Link
                    to={`/cases/${r.caseKey}?tab=decision`}
                    className="block px-5 py-3.5 hover:bg-raised/60"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-[12px] text-ink-faint">
                        {r.key} · {r.caseKey}
                      </span>
                      <RecStatusPill value={r.status} />
                    </span>
                    <span className="mt-1 block text-sm font-medium text-ink">
                      {r.option.title}: {r.caseTitle}
                    </span>
                    <span className="text-[12px] text-ink-faint">
                      Next:{' '}
                      {r.status === 'in_review'
                        ? 'expert review · Domain Expert'
                        : r.status === 'awaiting_second_approval'
                          ? 'second approval · a different Expert Approver or Executive / Governor'
                          : `decision · ${r.option.authority ? ROLE_LABEL[r.option.authority.requiredRole] : 'Expert Approver'}`}{' '}
                      · {formatRelative(r.updatedAt)}
                    </span>
                  </Link>
                </StaggerItem>
              ))}
              {awaitingRec.map((c) => (
                <StaggerItem key={c.id}>
                  <Link to={`/cases/${c.key}?tab=decision`} className="block px-5 py-3.5 hover:bg-raised/60">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-[12px] text-ink-faint">{c.key}</span>
                      <StateBadge value={c.state} />
                      <UrgencyBadge value={c.urgency} />
                    </span>
                    <span className="mt-1 block text-sm font-medium text-ink">{c.title}</span>
                    <span className="text-[12px] text-ink-faint">
                      Next: a recommendation from a recorded scenario run · Intelligence Analyst ·{' '}
                      {formatRelative(c.updatedAt)}
                    </span>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerList>
          ) : null}
        </Panel>

        <Panel aria-labelledby="log-heading" className="overflow-x-auto">
          <PanelHeader
            id="log-heading"
            icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
            title="Decision log"
            description="Every recorded decision with the policy result it passed. Blocked attempts are refused and kept in the audit trail."
          />
          <LoadState isPending={log.isPending} error={log.error} />
          {log.data ? (
            log.data.length === 0 ? (
              <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
                No decisions recorded yet.
              </p>
            ) : (
              <table className="w-full min-w-[48rem] border-t border-line text-sm">
                <caption className="sr-only">Recorded decisions</caption>
                <thead>
                  <tr className="text-xs text-ink-faint">
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      Decision
                    </th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">
                      Case
                    </th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">
                      Outcome
                    </th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">
                      Policy
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      Decided by
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {log.data.map((d) => (
                    <tr key={d.id}>
                      <td className="tabular px-5 py-3 align-top text-ink">
                        {d.key}
                        <span className="block text-xs text-ink-faint">{formatRelative(d.createdAt)}</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Link
                          to={`/cases/${d.caseKey}?tab=decision`}
                          className="text-cyan underline underline-offset-2"
                        >
                          {d.caseKey}
                        </Link>
                        <span className="block text-xs text-ink-muted">{d.actionClass}</span>
                      </td>
                      <td className="px-3 py-3 align-top text-ink">
                        {OUTCOME_LABEL[d.outcome]}
                        {d.policyResult === 'hold' ? (
                          <span className="block text-xs text-ink-muted">First of two approvals</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <PolicyResultBadge value={d.policyResult} />
                      </td>
                      <td className="px-5 py-3 align-top text-ink">
                        {d.approver.name}
                        <span className="block text-xs text-ink-faint">{d.approver.title}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}
        </Panel>

        <Panel aria-labelledby="mine-heading">
          <PanelHeader
            id="mine-heading"
            icon={<UserCheck className="h-4 w-4" aria-hidden />}
            title={t('top.approvals')}
            description={`${t('top.approvalsHint')} (${ROLE_LABEL[role]}).`}
          />
          <LoadState isPending={pending.isPending} error={pending.error} />
          {pending.data ? (
            pending.data.items.length === 0 ? (
              <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">{t('top.noApprovals')}</p>
            ) : (
              <StaggerList className="divide-y divide-line border-t border-line">
                {pending.data.items.map((i) => (
                  <AttentionRow key={`${i.kind}:${i.id}`} item={i} />
                ))}
              </StaggerList>
            )
          ) : null}
        </Panel>
      </div>
    </>
  );
}

/** The manual handoff lifecycle: every stage is a named human action recorded here. */
const HANDOFF_STAGES = [
  { name: 'Approved', detail: 'A named approver records the decision after mandatory expert review.' },
  { name: 'Acknowledged', detail: 'The operations owner accepts the handoff and its scope.' },
  { name: 'In progress', detail: "Carried out through the institution's own systems, never by TIGERIS." },
  { name: 'Outcome recorded', detail: 'The owner records what happened; it becomes institutional memory.' },
];

/** Governed execution: tracks manual handoffs to operations owners. TIGERIS never executes an external action. */
export function ExecutionPage({ ctx }: { ctx: AuthContext }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['handoffs'], queryFn: api.handoffs });
  const operates = HANDOFF_ROLES.some((r) => ctx.principal.roles.includes(r));
  const active = (q.data ?? []).filter((h) => h.status !== 'completed');
  const done = (q.data ?? []).filter((h) => h.status === 'completed');
  return (
    <>
      <PageHeader
        title={t('nav.execution')}
        description="Approved decisions handed to named operations owners, with acknowledgement and outcome tracking."
      />
      <Note icon={<Handshake className="h-4 w-4" aria-hidden />}>
        TIGERIS does not execute actions in external systems. After approval, an operations owner acknowledges
        the handoff, carries it out through the institution&apos;s own processes, and records status and
        outcome here.
      </Note>
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        <div className="space-y-6">
          <section aria-labelledby="handoff-heading" className="space-y-3">
            <h2 id="handoff-heading" className="text-lg text-ink">
              Open handoffs
            </h2>
            {active.length === 0 ? (
              <Panel>
                <p className="px-5 pt-4 text-sm text-ink-muted">
                  <span className="font-medium text-ink">No open handoffs.</span> A handoff appears when a
                  decision is approved after expert review.
                </p>
                <h3 className="mx-5 mt-5 text-[13px] font-semibold text-ink">How a handoff moves</h3>
                <ol className="grid gap-px overflow-hidden px-5 pt-2 pb-5 sm:grid-cols-2 xl:grid-cols-4">
                  {HANDOFF_STAGES.map((st) => (
                    <li key={st.name} className="border-s-2 border-line-strong py-1 ps-3 pe-4">
                      <p className="text-sm font-medium text-ink">{st.name}</p>
                      <p className="text-[13px] text-ink-muted">{st.detail}</p>
                    </li>
                  ))}
                </ol>
              </Panel>
            ) : (
              active.map((h) => <HandoffCard key={h.id} h={h} canAct={operates} showCase />)
            )}
          </section>
          {done.length ? (
            <section aria-labelledby="done-heading" className="space-y-3">
              <h2 id="done-heading" className="text-lg text-ink">
                Completed
              </h2>
              {done.map((h) => (
                <HandoffCard key={h.id} h={h} canAct={false} showCase />
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
