/**
 * AI Command, Mandates & Authority, Decisions & Approvals and Governed Execution.
 * Each shows recorded institutional state only; nothing here executes an action (CLAUDE.md §6).
 */
import type { AuthContext, CaseState } from '@tigeris/shared';
import { SECTORS } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  Bot,
  CalendarClock,
  Check,
  Cpu,
  Gavel,
  Handshake,
  Lock,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { AgentDraft } from '@/components/scenario/Drafts';
import { Sheet } from '@/components/ui/sheet';
import { ClaimBadge, StateBadge, UrgencyBadge } from '@/components/truth/badges';
import { ListRow, StatusPill } from '@/components/ui/data';
import { StaggerItem, StaggerList } from '@/components/ui/motion';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Reveal } from '@/components/ui/reveal';
import { useAgentRunStats, runsLabel, type AgentRunItem } from '@/lib/agents';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { SECTOR_LABEL_AR, useI18n } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';
import { AttentionRow } from '@/pages/Overview';
import { SECTOR_ICON } from '@/pages/sectorIcons';

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
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            Registered specialists
          </p>
          <p className="tabular mt-1 font-serif text-3xl font-semibold text-ink">{total}</p>
          <p className="text-xs text-ink-muted">
            Across {SECTORS.length} sector configurations · {stats.size} have recorded runs
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Model gateway</p>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Recorded runs</p>
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
                        {r.caseKey ? (
                          <span className="tabular font-mono text-ink-muted">{r.caseKey}</span>
                        ) : (
                          '—'
                        )}
                        {r.scenarioKey ? (
                          <Link
                            to={`/scenarios/${r.scenarioKey}`}
                            className="tabular ms-1 font-mono text-cyan hover:underline"
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

      <h2 className="mb-3 text-xl text-ink">Specialist registry</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        {SECTORS.map((s, i) => {
          const Icon = SECTOR_ICON[s.key];
          return (
            <Reveal key={s.key} delay={i * 0.03}>
              <Panel aria-labelledby={`ai-${s.key}`}>
                <PanelHeader
                  id={`ai-${s.key}`}
                  icon={<Icon className="h-4 w-4" aria-hidden />}
                  title={lang === 'ar' ? SECTOR_LABEL_AR[s.key] : s.label}
                  action={
                    <Link to={`/sectors/${s.key}`} className="text-sm text-cyan hover:underline">
                      Sector centre
                    </Link>
                  }
                />
                <div className="divide-y divide-line border-t border-line">
                  {s.agents.map((a) => {
                    const label = runsLabel(stats.get(a.key));
                    return (
                      <ListRow
                        key={a.key}
                        icon={Bot}
                        title={a.name}
                        description={a.description}
                        trailing={
                          label ? (
                            <StatusPill tone="ok">{label}</StatusPill>
                          ) : (
                            <StatusPill tone="awaiting">{t('common.noRunsYet')}</StatusPill>
                          )
                        }
                      />
                    );
                  })}
                </div>
              </Panel>
            </Reveal>
          );
        })}
      </div>
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
                  <span className="tabular font-mono text-xs text-ink-faint">{m.key}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{m.title}</span>
                    <span className="block text-xs text-ink-muted">{m.description}</span>
                    <span className="mt-1 block text-[11px] text-ink-faint">
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
              <table className="w-full min-w-[44rem] text-sm">
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

/** Review and decision queue. Recording a decision is a named human transition that arrives in Phase 4. */
export function DecisionsPage({ ctx }: { ctx: AuthContext }) {
  const { t } = useI18n();
  const cases = useQuery({ queryKey: ['cases'], queryFn: api.cases });
  const pending = useQuery({ queryKey: ['approvals', 'pending'], queryFn: api.pendingApprovals });
  const queue = (cases.data ?? []).filter((c) => DECISION_STATES.includes(c.state));
  const role = ctx.principal.roles[0]!;
  return (
    <>
      <PageHeader
        title={t('nav.decisions')}
        description="Cases awaiting expert review or a decision, and what is waiting on your role."
      />
      <Note icon={<CalendarClock className="h-4 w-4" aria-hidden />}>
        Decision recording (approve, reject, defer, request evidence) arrives in Phase 4. Expert review is
        mandatory before any decision, and a creator can never approve their own recommendation.
      </Note>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel aria-labelledby="queue-heading">
          <PanelHeader
            id="queue-heading"
            icon={<Gavel className="h-4 w-4" aria-hidden />}
            title="Review & decision queue"
          />
          <LoadState isPending={cases.isPending} error={cases.error} />
          <StaggerList className="divide-y divide-line border-t border-line">
            {cases.data && queue.length === 0 ? (
              <StaggerItem className="px-5 py-4 text-sm text-ink-muted">
                Nothing is awaiting review or decision.
              </StaggerItem>
            ) : null}
            {queue.map((c) => (
              <StaggerItem key={c.id}>
                <Link to={`/cases/${c.key}`} className="block px-5 py-3.5 hover:bg-raised/60">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular font-mono text-[11px] text-ink-faint">{c.key}</span>
                    <StateBadge value={c.state} />
                    <UrgencyBadge value={c.urgency} />
                  </span>
                  <span className="mt-1 block text-sm font-medium text-ink">{c.title}</span>
                  <span className="text-[11px] text-ink-faint">
                    Next: {c.nextStep} · {c.nextStepRole ? ROLE_LABEL[c.nextStepRole] : '—'} ·{' '}
                    {formatRelative(c.updatedAt)}
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </StaggerList>
        </Panel>
        <Panel aria-labelledby="mine-heading" className="self-start">
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

/** Governed execution: tracks manual handoffs to operations owners. TIGERIS never executes an external action. */
export function ExecutionPage() {
  const { t } = useI18n();
  const cases = useQuery({ queryKey: ['cases'], queryFn: api.cases });
  const handoffs = (cases.data ?? []).filter((c) => c.state === 'handoff');
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
      <Panel aria-labelledby="handoff-heading">
        <PanelHeader
          id="handoff-heading"
          icon={<Users className="h-4 w-4" aria-hidden />}
          title="Manual handoffs"
        />
        <LoadState isPending={cases.isPending} error={cases.error} />
        {cases.data ? (
          handoffs.length === 0 ? (
            <div className="flex flex-col items-center border-t border-line px-5 py-12 text-center">
              <Handshake className="h-7 w-7 text-brand/70" aria-hidden />
              <p className="mt-2 text-sm font-medium text-ink">No approved handoffs yet</p>
              <p className="max-w-md text-xs text-ink-faint">
                Handoffs appear once a decision is approved. Decision recording arrives in Phase 4.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {handoffs.map((c) => (
                <ListRow
                  key={c.id}
                  icon={Handshake}
                  to={`/cases/${c.key}`}
                  title={c.title}
                  description={`${c.key} · ${c.owner}`}
                  trailing={<StatusPill tone="awaiting">Awaiting acknowledgement</StatusPill>}
                />
              ))}
            </div>
          )
        ) : null}
      </Panel>
    </>
  );
}
