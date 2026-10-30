/**
 * Decision guardrails (Phase 5C, FR-54): standing rules recorded from approved decisions and enforced by the decision
 * policy on later approvals of the same action class. Recorded by the executive or the approver of the decision;
 * lifted, never edited, by another executive with a reason. Status is words plus an icon.
 */
import { ROLES, type GuardrailItem } from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Clock, ShieldAlert, UserCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { LoadState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/data';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ApiError, api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/roles';
import { useAuthContext } from '@/lib/session';

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

function rule(g: GuardrailItem) {
  const above = g.threshold ? ` above ${g.threshold.value.toLocaleString('en')} ${g.threshold.unit}` : '';
  return g.effect === 'block'
    ? `Blocks approval of "${g.actionClass}"${above}`
    : `"${g.actionClass}"${above} needs the ${ROLE_LABEL[g.requiredRole!]} to approve`;
}

function StateLabel({ g }: { g: GuardrailItem }) {
  if (g.status === 'lifted')
    return (
      <StatusPill tone="low">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Lifted
        </span>
      </StatusPill>
    );
  if (g.expired)
    return (
      <StatusPill tone="awaiting">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Expired
        </span>
      </StatusPill>
    );
  return (
    <StatusPill tone={g.effect === 'block' ? 'high' : 'medium'}>
      <span className="inline-flex items-center gap-1">
        {g.effect === 'block' ? (
          <Ban className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <UserCheck className="h-3.5 w-3.5" aria-hidden />
        )}
        Active
      </span>
    </StatusPill>
  );
}

function Lift({ g }: { g: GuardrailItem }) {
  const id = useId();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.liftGuardrail(g.key, reason),
    onSettled: () => qc.invalidateQueries({ queryKey: ['guardrails'] }),
  });
  return (
    <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-r`}>
        Reason for lifting (recorded)
        <input id={`${id}-r`} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <Button size="sm" disabled={m.isPending || reason.trim().length < 10} onClick={() => m.mutate()}>
        Lift guardrail
      </Button>
      {m.error ? (
        <p role="alert" className="text-xs text-red sm:col-span-2">
          {m.error instanceof ApiError && m.error.code === 'self_lift'
            ? 'You recorded this guardrail; another executive must lift it.'
            : 'Not recorded. Try again.'}
        </p>
      ) : null}
    </div>
  );
}

function RecordForm() {
  const id = useId();
  const qc = useQueryClient();
  const auth = useAuthContext();
  const log = useQuery({ queryKey: ['decisions'], queryFn: api.decisions });
  const me = auth.data?.principal;
  const isExec = me?.roles.includes('executive') ?? false;
  const eligible = (log.data ?? []).filter(
    (d) => d.outcome === 'approve' && (isExec || d.approver.id === me?.id),
  );
  const [f, setF] = useState({
    decision: '',
    effect: 'require_role' as 'block' | 'require_role',
    requiredRole: 'executive' as (typeof ROLES)[number],
    thresholdValue: '',
    thresholdUnit: '',
    statement: '',
    expiresOn: '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const decision = f.decision || eligible[0]?.key || '';
  const m = useMutation({
    mutationFn: () =>
      api.recordGuardrail(decision, {
        effect: f.effect,
        requiredRole: f.effect === 'require_role' ? f.requiredRole : undefined,
        thresholdValue: f.thresholdValue ? Number(f.thresholdValue) : undefined,
        thresholdUnit: f.thresholdValue ? f.thresholdUnit : undefined,
        statement: f.statement,
        expiresOn: f.expiresOn || undefined,
      }),
    onSuccess: async () => {
      setF({ ...f, statement: '', thresholdValue: '', thresholdUnit: '' });
      await qc.invalidateQueries({ queryKey: ['guardrails'] });
    },
  });
  if (!me || !(isExec || me.roles.includes('approver'))) return null;
  return (
    <Panel aria-labelledby="guardrail-form-heading">
      <PanelHeader
        id="guardrail-form-heading"
        title="Record a guardrail from a decision"
        description="It applies to the decision's action class from now on, for every approver. The executive, or the approver of the decision, records one."
      />
      {eligible.length ? (
        <form
          className="grid gap-3 border-t border-line px-5 py-4 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <label className="text-sm font-medium text-ink md:col-span-3" htmlFor={`${id}-d`}>
            Approved decision
            <select id={`${id}-d`} className={field} value={decision} onChange={set('decision')}>
              {eligible.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.key} · {d.actionClass} · {d.caseKey}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-ink" htmlFor={`${id}-e`}>
            Effect
            <select id={`${id}-e`} className={field} value={f.effect} onChange={set('effect')}>
              <option value="require_role">Require a named role</option>
              <option value="block">Block approval</option>
            </select>
          </label>
          {f.effect === 'require_role' ? (
            <label className="text-sm font-medium text-ink" htmlFor={`${id}-role`}>
              Required role
              <select
                id={`${id}-role`}
                className={field}
                value={f.requiredRole}
                onChange={set('requiredRole')}
              >
                {ROLES.filter((r) => r === 'executive' || r === 'approver').map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span aria-hidden className="hidden md:block" />
          )}
          <label className="text-sm font-medium text-ink" htmlFor={`${id}-x`}>
            Expires on (optional)
            <input
              id={`${id}-x`}
              type="date"
              className={field}
              value={f.expiresOn}
              onChange={set('expiresOn')}
            />
          </label>
          <label className="text-sm font-medium text-ink" htmlFor={`${id}-tv`}>
            Only above (optional)
            <input
              id={`${id}-tv`}
              className={field}
              inputMode="decimal"
              value={f.thresholdValue}
              onChange={set('thresholdValue')}
            />
          </label>
          <label className="text-sm font-medium text-ink" htmlFor={`${id}-tu`}>
            Unit of that size
            <input
              id={`${id}-tu`}
              className={field}
              value={f.thresholdUnit}
              onChange={set('thresholdUnit')}
            />
          </label>
          <span aria-hidden className="hidden md:block" />
          <label className="text-sm font-medium text-ink md:col-span-3" htmlFor={`${id}-s`}>
            Guardrail, in words (recorded)
            <input id={`${id}-s`} className={field} value={f.statement} onChange={set('statement')} />
          </label>
          {m.error ? (
            <p role="alert" className="text-sm text-red md:col-span-3">
              {m.error instanceof ApiError && m.error.code === 'not_decider'
                ? 'Only the executive or the approver of this decision records a guardrail from it.'
                : 'Check the statement (at least 10 characters) and give a threshold value and unit together.'}
            </p>
          ) : null}
          {m.isSuccess ? (
            <p role="status" className="text-sm text-emerald md:col-span-3">
              Guardrail recorded. Later approvals of this action class are checked against it.
            </p>
          ) : null}
          <div className="md:col-span-3">
            <Button type="submit" variant="primary" disabled={m.isPending || !decision}>
              Record guardrail
            </Button>
          </div>
        </form>
      ) : (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
          No approved decision you may record a guardrail from yet.
        </p>
      )}
    </Panel>
  );
}

export function GuardrailsView() {
  const q = useQuery({ queryKey: ['guardrails'], queryFn: api.guardrails });
  return (
    <div className="grid gap-6">
      <Panel aria-labelledby="guardrails-heading">
        <PanelHeader
          id="guardrails-heading"
          icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
          title="Decision guardrails"
          description="Standing rules recorded from approved decisions. decision-policy 1.2.0 checks every active guardrail when an action of its class is approved, and names it when it blocks."
        />
        <LoadState isPending={q.isPending} error={q.error} />
        {q.data ? (
          q.data.guardrails.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {q.data.guardrails.map((g) => (
                <li key={g.key} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StateLabel g={g} />
                    <span className="tabular text-xs text-ink-faint">{g.key}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">{g.statement}</p>
                  <p className="mt-1 text-sm text-ink-muted">{rule(g)}</p>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-faint">
                    <span>
                      Recorded by {g.createdBy} {formatRelative(g.createdAt)}
                    </span>
                    {g.decisionKey && g.caseKey ? (
                      <Link
                        className="text-brand underline-offset-2 hover:underline"
                        to={`/cases/${g.caseKey}`}
                      >
                        From {g.decisionKey} on {g.caseKey}
                      </Link>
                    ) : (
                      <span>From a decision on a case outside your read scope</span>
                    )}
                    {g.expiresOn ? <span>Expires {g.expiresOn}</span> : <span>No expiry</span>}
                  </p>
                  {g.liftedBy ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      Lifted by {g.liftedBy}: {g.liftReason}
                    </p>
                  ) : null}
                  {q.data.canLift && g.status === 'active' ? <Lift g={g} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
              No guardrails recorded. Approvals are checked against mandates, the authority matrix and
              delegated limits only.
            </p>
          )
        ) : null}
      </Panel>
      <RecordForm />
    </div>
  );
}
