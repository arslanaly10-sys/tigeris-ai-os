/**
 * Audit & Administration (slice H). The audit log is the institution's hash-chained record of every protected act;
 * verification recomputes the chain from its first event. Administration grants and revokes roles and sector
 * workspaces with a reason; nobody changes their own access. Both are read-only for the Auditor.
 */
import {
  ROLES,
  SECTORS,
  SECTOR_BY_KEY,
  type AdminPrincipalItem,
  type AuditEventItem,
  type AuthContext,
  type Role,
  type SectorKey,
} from '@tigeris/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
import { CircleCheck, CircleX, Link2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { INDICATOR_SPRING } from '@/components/ui/motion';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Sheet } from '@/components/ui/sheet';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';
const tabClass =
  'relative px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink data-[state=active]:text-ink';

const ACTIONS = [
  { value: '', label: 'All actions' },
  { value: 'decision.', label: 'Decisions' },
  { value: 'review.', label: 'Reviews and notes' },
  { value: 'outcome.', label: 'Outcome reviews' },
  { value: 'analysis.', label: 'Case analysis' },
  { value: 'scenario.', label: 'Scenarios' },
  { value: 'handoff.', label: 'Handoffs' },
  { value: 'connector.', label: 'Connectors' },
  { value: 'admin.', label: 'Administration' },
  { value: 'audit.', label: 'Chain verification' },
];

// ───────────────────────────── Audit log ─────────────────────────────

function AuditRow({ e }: { e: AuditEventItem }) {
  return (
    <tr className="align-top">
      <td className="tabular px-5 py-2.5 text-ink-faint">{e.seq}</td>
      <td className="tabular px-3 py-2.5 text-ink">{formatDateTime(e.occurredAt)}</td>
      <td className="px-3 py-2.5 text-ink">
        {e.actor ?? (e.actorType === 'service' ? 'Service' : 'Unknown')}
      </td>
      <td className="px-3 py-2.5">
        <details>
          <summary className="cursor-pointer font-medium text-ink">{e.action}</summary>
          <pre className="mt-1 max-w-[32rem] overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-raised p-2 text-xs text-ink">
            {JSON.stringify(e.payload, null, 2)}
          </pre>
        </details>
      </td>
      <td className="px-3 py-2.5 text-ink-muted">
        {humanize(e.objectType)}
        {e.caseKey ? (
          <>
            {' · '}
            <Link to={`/cases/${e.caseKey}`} className="text-cyan underline underline-offset-2">
              {e.caseKey}
            </Link>
          </>
        ) : null}
      </td>
      <td className="px-5 py-2.5 font-mono text-xs text-ink-faint" title={e.hash}>
        {e.hash.slice(0, 10)}…
      </td>
    </tr>
  );
}

function AuditLog({ roles }: { roles: Role[] }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [action, setAction] = useState('');
  const [caseKey, setCaseKey] = useState('');
  const id = useId();
  const allowed = roles.some((r) => r === 'auditor' || r === 'administrator' || r === 'executive');
  const canVerify = roles.includes('auditor') || roles.includes('administrator');
  const key = caseKey.trim().toUpperCase();
  const q = useInfiniteQuery({
    queryKey: ['audit', action, key],
    queryFn: ({ pageParam }) =>
      api.audit({
        before: pageParam,
        action: action || undefined,
        caseKey: /^[A-Z0-9-]{3,40}$/.test(key) ? key : undefined,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (p) => p.nextBefore ?? undefined,
    enabled: allowed,
  });
  const verify = useMutation({
    mutationFn: api.verifyAudit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit'] }),
  });
  if (!allowed)
    return (
      <p className="text-sm text-ink-muted">
        The audit log is read by the Auditor, the Governance Administrator and the Executive / Governor.
      </p>
    );
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  const withheld = q.data?.pages[0]?.withheld ?? 0;
  const v = verify.data;
  return (
    <div className="space-y-6">
      <Panel aria-labelledby="chain-heading">
        <PanelHeader
          id="chain-heading"
          icon={<Link2 className="h-4 w-4" aria-hidden />}
          title="Chain verification"
          description="Every event carries the hash of the one before it. Verification recomputes each link and hash from the first event; it reads the whole chain, including events you cannot open."
          action={
            canVerify ? (
              <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
                {verify.isPending ? 'Verifying…' : t('oversight.verify')}
              </Button>
            ) : null
          }
        />
        <div className="border-t border-line px-5 py-3 text-sm">
          {v ? (
            <p className={`flex items-start gap-2 ${v.valid ? 'text-emerald' : 'text-red'}`} role="status">
              {v.valid ? (
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>
                {v.valid
                  ? `Intact: ${v.checked} events verified from genesis at ${formatDateTime(v.verifiedAt)}. Head ${v.headHash?.slice(0, 16)}…`
                  : `Broken at event ${v.brokenAt}: ${v.reason} (${v.checked} events checked).`}
              </span>
            </p>
          ) : (
            <p className="text-ink-muted">
              {canVerify
                ? 'Not verified in this session.'
                : 'The Auditor or Administrator runs verification.'}{' '}
              Verification is itself recorded in the log.
            </p>
          )}
        </div>
      </Panel>

      <Panel aria-labelledby="log-heading" className="overflow-hidden">
        <PanelHeader
          id="log-heading"
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          title="Audit log"
          description="Newest first. Open an action to see what was recorded with it."
        />
        <div className="flex flex-wrap gap-3 border-t border-line px-5 py-3">
          <label className="text-xs font-medium text-ink-muted" htmlFor={`${id}-a`}>
            Action
            <select
              id={`${id}-a`}
              className={field}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted" htmlFor={`${id}-c`}>
            Case key
            <input
              id={`${id}-c`}
              className={field}
              value={caseKey}
              placeholder="e.g. HMZ-2024-0413"
              onChange={(e) => setCaseKey(e.target.value)}
            />
          </label>
        </div>
        {withheld ? (
          <p className="border-t border-line px-5 py-2 text-sm text-ink-muted">
            {withheld} matching {withheld === 1 ? 'event belongs' : 'events belong'} to cases above your
            clearance and {withheld === 1 ? 'is' : 'are'} not shown.
          </p>
        ) : null}
        <LoadState isPending={q.isPending} error={q.error} />
        {q.data ? (
          events.length === 0 ? (
            <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">No events match.</p>
          ) : (
            <div
              className="overflow-x-auto border-t border-line"
              tabIndex={0}
              role="region"
              aria-label="Audit events"
            >
              <table className="w-full min-w-[56rem] text-sm">
                <caption className="sr-only">Audit events, newest first</caption>
                <thead>
                  <tr className="text-xs text-ink-faint">
                    <th scope="col" className="px-5 py-2.5 text-start font-medium">
                      Seq
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-start font-medium">
                      When
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-start font-medium">
                      Who
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-start font-medium">
                      Action
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-start font-medium">
                      Object
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-start font-medium">
                      Hash
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {events.map((e) => (
                    <AuditRow key={e.seq} e={e} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
        {q.hasNextPage ? (
          <div className="border-t border-line px-5 py-3">
            <Button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? 'Loading…' : 'Load older events'}
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

// ───────────────────────────── Administration ─────────────────────────────

type Change = 'grant_role' | 'revoke_role' | 'grant_workspace' | 'revoke_workspace';

function AccessSheet({ p, onClose }: { p: AdminPrincipalItem; onClose: () => void }) {
  const qc = useQueryClient();
  const id = useId();
  const [change, setChange] = useState<Change>('grant_role');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const isRole = change.endsWith('role');
  const grant = change.startsWith('grant');
  const options = isRole
    ? ROLES.filter((r) => (grant ? !p.roles.includes(r) : p.roles.includes(r))).map((r) => ({
        v: r,
        l: ROLE_LABEL[r],
      }))
    : SECTORS.filter((s) => (grant ? !p.workspaces.includes(s.key) : p.workspaces.includes(s.key))).map(
        (s) => ({
          v: s.key,
          l: s.label,
        }),
      );
  const m = useMutation({
    mutationFn: () =>
      api.changeAccess(
        p.id,
        isRole
          ? { kind: 'role', role: value as Role, grant, reason }
          : { kind: 'workspace', sectorKey: value as SectorKey, grant, reason },
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (value && reason.trim().length >= 10) m.mutate();
      }}
    >
      <p className="text-sm text-ink-muted">
        {p.title} · roles: {p.roles.map((r) => ROLE_LABEL[r]).join(', ') || 'none'} · workspaces:{' '}
        {p.workspaces.length
          ? p.workspaces.map((w) => SECTOR_BY_KEY[w].label).join(', ')
          : 'all (none assigned)'}
      </p>
      <label className="block text-sm font-medium text-ink" htmlFor={`${id}-c`}>
        Change
        <select
          id={`${id}-c`}
          className={field}
          value={change}
          onChange={(e) => {
            setChange(e.target.value as Change);
            setValue('');
          }}
        >
          <option value="grant_role">Grant a role</option>
          <option value="revoke_role">Revoke a role</option>
          <option value="grant_workspace">Assign a sector workspace</option>
          <option value="revoke_workspace">Remove a sector workspace</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-ink" htmlFor={`${id}-v`}>
        {isRole ? 'Role' : 'Sector workspace'}
        <select id={`${id}-v`} className={field} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      </label>
      {!isRole ? (
        <p className="text-xs text-ink-muted">
          A person with no assigned workspace reads every workspace within their clearance; assigning one
          narrows it.
        </p>
      ) : null}
      <label className="block text-sm font-medium text-ink" htmlFor={`${id}-r`}>
        Reason <span className="font-normal text-ink-faint">(required, recorded in the audit trail)</span>
        <textarea
          id={`${id}-r`}
          rows={3}
          className={`${field} py-2`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {m.error ? (
        <p role="alert" className="text-sm text-red">
          {m.error instanceof ApiError && m.error.code === 'own_access'
            ? 'Another administrator must change your own access.'
            : 'The change could not be recorded. Nothing was changed.'}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={!value || reason.trim().length < 10 || m.isPending}>
        Record change
      </Button>
    </form>
  );
}

function ProvisionForm() {
  const qc = useQueryClient();
  const id = useId();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [role, setRole] = useState<Role>('analyst');
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.provision({ displayName: name, title, idpSubject: subject, role, reason }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin'] });
      setName('');
      setTitle('');
      setSubject('');
      setReason('');
    },
  });
  const valid =
    name.trim().length >= 2 &&
    title.trim().length >= 2 &&
    subject.trim().length >= 3 &&
    reason.trim().length >= 10;
  return (
    <form
      className="grid gap-3 border-t border-line px-5 py-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) m.mutate();
      }}
    >
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-n`}>
        Name
        <input id={`${id}-n`} className={field} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-t`}>
        Title
        <input id={`${id}-t`} className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-s`}>
        Identity-provider subject <span className="font-normal text-ink-faint">(work email or IdP id)</span>
        <input
          id={`${id}-s`}
          className={field}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-r`}>
        First role
        <select
          id={`${id}-r`}
          className={field}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-ink md:col-span-2" htmlFor={`${id}-why`}>
        Reason <span className="font-normal text-ink-faint">(required, recorded in the audit trail)</span>
        <input
          id={`${id}-why`}
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {m.error ? (
        <p role="alert" className="text-sm text-red md:col-span-2">
          {m.error instanceof ApiError && m.error.code === 'identity_exists'
            ? 'Someone with this identity is already provisioned.'
            : 'The person could not be provisioned. Nothing was changed.'}
        </p>
      ) : null}
      {m.isSuccess ? (
        <p role="status" className="text-sm text-emerald md:col-span-2">
          Provisioned. They sign in through the institution's identity provider once it is connected.
        </p>
      ) : null}
      <div className="md:col-span-2">
        <Button type="submit" variant="primary" disabled={!valid || m.isPending}>
          Provision person
        </Button>
      </div>
    </form>
  );
}

function Administration({ roles, me }: { roles: Role[]; me: string }) {
  const allowed = roles.includes('administrator') || roles.includes('auditor');
  const q = useQuery({ queryKey: ['admin'], queryFn: api.admin, enabled: allowed });
  const [editing, setEditing] = useState<AdminPrincipalItem | null>(null);
  if (!allowed)
    return (
      <p className="text-sm text-ink-muted">
        Administration is managed by the Governance Administrator and read by the Auditor.
      </p>
    );
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const d = q.data;
  const manage = d.canManage.allowed;
  return (
    <div className="space-y-6">
      <Panel aria-labelledby="inst-heading">
        <PanelHeader
          id="inst-heading"
          title="Institution"
          description="Each institution's data is isolated by row-level security; nothing here is shared with another institution."
        />
        <dl className="grid gap-4 border-t border-line px-5 py-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-muted">Name</dt>
            <dd className="font-medium text-ink">{d.institution.name}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Key</dt>
            <dd className="tabular text-ink">{d.institution.key}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Kind</dt>
            <dd className="text-ink">
              {d.institution.isSynthetic ? 'Fictional demonstration institution' : 'Institution'}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel aria-labelledby="people-heading" className="overflow-hidden">
        <PanelHeader
          id="people-heading"
          icon={<Users className="h-4 w-4" aria-hidden />}
          title="People and access"
          description={d.canManage.reason}
        />
        <div
          className="overflow-x-auto border-t border-line"
          tabIndex={0}
          role="region"
          aria-label="People and access"
        >
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="sr-only">People, roles and sector workspaces</caption>
            <thead>
              <tr className="text-xs text-ink-faint">
                <th scope="col" className="px-5 py-2.5 text-start font-medium">
                  Person
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  Roles
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  Workspaces
                </th>
                <th scope="col" className="px-5 py-2.5 text-end font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.principals.map((p) => (
                <tr key={p.id} className="align-top">
                  <th scope="row" className="px-5 py-3 text-start font-normal">
                    <span className="block font-medium text-ink">{p.displayName}</span>
                    <span className="block text-xs text-ink-muted">
                      {p.title} · {p.identity}
                    </span>
                  </th>
                  <td className="px-3 py-3 text-ink">
                    {p.roles.length ? (
                      p.roles.map((r) => ROLE_LABEL[r]).join(', ')
                    ) : (
                      <span className="text-ink-muted">None</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-ink">
                    {p.workspaces.length ? (
                      p.workspaces.map((w) => SECTOR_BY_KEY[w].label).join(', ')
                    ) : (
                      <span className="text-ink-muted">All, within clearance</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-end">
                    {manage && p.id !== me ? (
                      <Button size="sm" onClick={() => setEditing(p)}>
                        Change access<span className="sr-only"> for {p.displayName}</span>
                      </Button>
                    ) : p.id === me ? (
                      <span className="text-xs text-ink-muted">You</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {manage ? (
        <Panel aria-labelledby="provision-heading">
          <PanelHeader
            id="provision-heading"
            icon={<UserPlus className="h-4 w-4" aria-hidden />}
            title="Provision a person"
            description="Adds someone from the institution's identity provider with one role. TIGERIS stores no password; they sign in through the identity provider once it is connected."
          />
          <ProvisionForm />
        </Panel>
      ) : null}

      <Sheet
        open={editing !== null}
        onOpenChange={(o) => (o ? null : setEditing(null))}
        title={editing ? `Change access: ${editing.displayName}` : ''}
      >
        {editing ? <AccessSheet p={editing} onClose={() => setEditing(null)} /> : null}
      </Sheet>
    </div>
  );
}

const VIEWS = [
  { value: 'audit', label: 'oversight.audit' },
  { value: 'admin', label: 'oversight.admin' },
] as const;

export function OversightPage({ ctx }: { ctx: AuthContext }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'admin' ? 'admin' : 'audit';
  const roles = ctx.principal.roles;
  return (
    <>
      <PageHeader
        title={t('nav.oversight')}
        description="The institution's tamper-evident record of every protected act, and who may do what. Changes to access need a reason and are audited; nobody changes their own access."
      />
      <Tabs.Root value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <Tabs.List
          aria-label="Audit and administration"
          className="mb-5 flex flex-wrap gap-1 border-b border-line"
        >
          {VIEWS.map((x) => (
            <Tabs.Trigger key={x.value} value={x.value} className={tabClass}>
              {t(x.label)}
              {tab === x.value ? (
                <motion.span
                  layoutId="oversight-tab-indicator"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-gold"
                  transition={INDICATOR_SPRING}
                  aria-hidden
                />
              ) : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="audit" className="outline-none">
          <AuditLog roles={roles} />
        </Tabs.Content>
        <Tabs.Content value="admin" className="outline-none">
          <Administration roles={roles} me={ctx.principal.id} />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
