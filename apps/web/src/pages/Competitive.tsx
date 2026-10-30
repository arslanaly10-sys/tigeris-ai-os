/**
 * Competitive intelligence (slice J, FR-45..FR-50). Vendor-public web pages, crawled politely from approved domains
 * only. Claims are the vendor's own words until a person verifies them, and nothing here feeds cases, portfolios or
 * decision reports. A domain is never shown as collected until a crawl has actually fetched a page from it.
 */
import type { CiClaimItem, CiDomainItem, CiOverview, CiRunItem } from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
import { CircleCheck, CircleDashed, CircleSlash, CircleX, ExternalLink, Globe, Printer } from 'lucide-react';
import { useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { INDICATOR_SPRING } from '@/components/ui/motion';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, humanize } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';
const tabClass =
  'relative px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink data-[state=active]:text-ink';
const pill = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium';

function CollectionStatus({ d }: { d: CiDomainItem }) {
  if (d.status === 'pending_approval')
    return (
      <span className={cn(pill, 'border-amber/50 bg-amber-soft text-amber')}>
        <CircleDashed className="h-3.5 w-3.5" aria-hidden />
        Awaiting approval
      </span>
    );
  if (d.status === 'paused')
    return (
      <span className={cn(pill, 'border-line-strong bg-raised text-ink-muted')}>
        <CircleSlash className="h-3.5 w-3.5" aria-hidden />
        Paused
      </span>
    );
  if (d.collected)
    return (
      <span className={cn(pill, 'border-emerald/40 bg-emerald-soft text-emerald')}>
        <CircleCheck className="h-3.5 w-3.5" aria-hidden />
        Collected {d.lastSuccessAt ? formatDateTime(d.lastSuccessAt) : ''}
      </span>
    );
  if (d.lastError)
    return (
      <span className={cn(pill, 'border-red/40 bg-red-soft text-red')}>
        <CircleX className="h-3.5 w-3.5" aria-hidden />
        Not collected: last crawl failed
      </span>
    );
  return (
    <span className={cn(pill, 'border-line-strong bg-raised text-ink-muted')}>
      <CircleDashed className="h-3.5 w-3.5" aria-hidden />
      Approved · never crawled
    </span>
  );
}

const RUN_TONE: Record<CiRunItem['status'], string> = {
  running: 'border-line-strong bg-raised text-ink-muted',
  succeeded: 'border-emerald/40 bg-emerald-soft text-emerald',
  partial: 'border-amber/50 bg-amber-soft text-amber',
  failed: 'border-red/40 bg-red-soft text-red',
  blocked: 'border-red/40 bg-red-soft text-red',
};

function DomainActions({ d }: { d: CiDomainItem }) {
  const qc = useQueryClient();
  const id = useId();
  const [reason, setReason] = useState('');
  const done = () => qc.invalidateQueries({ queryKey: ['ci'] });
  const status = useMutation({
    mutationFn: (s: 'approved' | 'paused') => api.ciDomainStatus(d.key, s, reason),
    onSuccess: async () => {
      setReason('');
      await done();
    },
  });
  const crawl = useMutation({ mutationFn: () => api.ciCrawl(d.key), onSettled: done });
  const valid = reason.trim().length >= 10;
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      {d.status === 'approved' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => crawl.mutate()} disabled={crawl.isPending}>
            {crawl.isPending ? 'Crawling…' : 'Crawl now'}
            <span className="sr-only"> {d.vendor}</span>
          </Button>
          {crawl.data?.queued ? (
            <span className="text-xs text-ink-muted">Queued; the run appears below.</span>
          ) : null}
          {crawl.error ? (
            <span role="alert" className="text-xs text-red">
              The crawl could not start.
            </span>
          ) : null}
        </div>
      ) : null}
      <label className="block text-xs font-medium text-ink-muted" htmlFor={`${id}-r`}>
        Reason for a status change (recorded)
        <input id={`${id}-r`} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        {d.status !== 'approved' ? (
          <Button
            size="sm"
            variant="primary"
            disabled={!valid || status.isPending}
            onClick={() => status.mutate('approved')}
          >
            {d.status === 'pending_approval' ? 'Approve domain' : 'Resume'}
            <span className="sr-only"> {d.vendor}</span>
          </Button>
        ) : (
          <Button size="sm" disabled={!valid || status.isPending} onClick={() => status.mutate('paused')}>
            Pause<span className="sr-only"> {d.vendor}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function AddDomain() {
  const qc = useQueryClient();
  const id = useId();
  const [f, setF] = useState({ key: '', vendor: '', host: '', pathPrefix: '/', category: '', reason: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () => api.ciAddDomain(f),
    onSuccess: async () => {
      setF({ key: '', vendor: '', host: '', pathPrefix: '/', category: '', reason: '' });
      await qc.invalidateQueries({ queryKey: ['ci'] });
    },
  });
  return (
    <form
      className="grid gap-3 border-t border-line px-5 py-4 md:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      {(
        [
          ['vendor', 'Vendor'],
          ['key', 'Key (lowercase, hyphens)'],
          ['category', 'Category'],
          ['host', 'Host (e.g. www.vendor.com)'],
          ['pathPrefix', 'Path scope'],
          ['reason', 'Reason (recorded)'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="text-sm font-medium text-ink" htmlFor={`${id}-${k}`}>
          {label}
          <input id={`${id}-${k}`} className={field} value={f[k]} onChange={set(k)} />
        </label>
      ))}
      {m.error ? (
        <p role="alert" className="text-sm text-red md:col-span-3">
          {m.error instanceof ApiError && m.error.code === 'domain_exists'
            ? 'A domain with this key already exists.'
            : 'Check the host (no https://), the path (starts with /) and a reason of at least 10 characters.'}
        </p>
      ) : null}
      <div className="md:col-span-3">
        <Button type="submit" variant="primary" disabled={m.isPending}>
          Add domain for approval
        </Button>
      </div>
    </form>
  );
}

function Vendors({ o }: { o: CiOverview }) {
  return (
    <div className="space-y-6">
      <ul className="grid gap-4 lg:grid-cols-2">
        {o.domains.map((d) => (
          <li key={d.id}>
            <article
              aria-labelledby={`ci-${d.key}`}
              className="h-full rounded-xl border border-line bg-panel px-5 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 id={`ci-${d.key}`} className="text-lg text-ink">
                    {d.vendor}
                  </h3>
                  <p className="text-xs text-ink-muted">
                    {d.category} · {d.host}
                    {d.pathPrefix !== '/' ? `${d.pathPrefix} only` : ''}
                  </p>
                </div>
                <CollectionStatus d={d} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-ink-muted">Pages</dt>
                  <dd className="tabular text-ink">{d.pages}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Candidate claims</dt>
                  <dd className="tabular text-ink">{d.claims.candidate}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Accepted</dt>
                  <dd className="tabular text-ink">{d.claims.accepted}</dd>
                </div>
              </dl>
              {d.lastError ? (
                <p className="mt-2 break-words rounded-md border border-red/30 bg-red-soft px-3 py-2 text-xs text-red">
                  Last attempt {d.lastCrawlAt ? formatDateTime(d.lastCrawlAt) : ''}: {d.lastError}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-ink-faint">
                {d.approvalBasis
                  ? `Approved: ${d.approvalBasis}${d.approvedBy ? ` · ${d.approvedBy}` : ''}`
                  : 'Not approved; it will not be crawled.'}
              </p>
              {o.canAdminister ? <DomainActions d={d} /> : null}
            </article>
          </li>
        ))}
      </ul>
      {o.canAdminister ? (
        <Panel aria-labelledby="add-domain-heading">
          <PanelHeader
            id="add-domain-heading"
            icon={<Globe className="h-4 w-4" aria-hidden />}
            title="Add a domain"
            description="Any domain beyond the approved set is added as awaiting approval and is not crawled until you approve it. Public pages only: no logins, paywalls or private portals."
          />
          <AddDomain />
        </Panel>
      ) : null}
    </div>
  );
}

function CurateForm({ c }: { c: CiClaimItem }) {
  const qc = useQueryClient();
  const id = useId();
  const [note, setNote] = useState('');
  const [paraphrase, setParaphrase] = useState('');
  const [verified, setVerified] = useState(false);
  const m = useMutation({
    mutationFn: (decision: 'accept' | 'reject') =>
      api.ciCurate(c.key, { decision, paraphrase: paraphrase || undefined, verified, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ci'] }),
  });
  const valid = note.trim().length >= 10;
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      <label className="text-xs font-medium text-ink-muted" htmlFor={`${id}-p`}>
        Paraphrase (optional)
        <input
          id={`${id}-p`}
          className={field}
          value={paraphrase}
          onChange={(e) => setParaphrase(e.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-ink-muted" htmlFor={`${id}-n`}>
        Curation note (recorded)
        <input id={`${id}-n`} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="flex items-start gap-2 text-xs text-ink md:col-span-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
          checked={verified}
          onChange={(e) => setVerified(e.target.checked)}
        />
        Independently verified (put the independent https source in the note)
      </label>
      {m.error ? (
        <p role="alert" className="text-xs text-red md:col-span-2">
          Not recorded. Verification needs an https source in the note.
        </p>
      ) : null}
      <div className="flex gap-2 md:col-span-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!valid || m.isPending}
          onClick={() => m.mutate('accept')}
        >
          Accept<span className="sr-only"> {c.key}</span>
        </Button>
        <Button size="sm" disabled={!valid || m.isPending} onClick={() => m.mutate('reject')}>
          Reject<span className="sr-only"> {c.key}</span>
        </Button>
      </div>
    </div>
  );
}

function Claims({ o }: { o: CiOverview }) {
  const [status, setStatus] = useState<CiClaimItem['status']>('candidate');
  const id = useId();
  const q = useQuery({ queryKey: ['ci', 'claims', status], queryFn: () => api.ciClaims({ status }) });
  return (
    <Panel aria-labelledby="claims-heading">
      <PanelHeader
        id="claims-heading"
        title="Vendor claims"
        description="Whole sentences proposed by rule from vendor pages. They are the vendor's own statements; an analyst or domain expert accepts or rejects each one."
        action={
          <label className="text-xs font-medium text-ink-muted" htmlFor={id}>
            Show
            <select
              id={id}
              className={field}
              value={status}
              onChange={(e) => setStatus(e.target.value as CiClaimItem['status'])}
            >
              <option value="candidate">Candidates</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        }
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        q.data.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
            No {status} claims. Claims appear only after a crawl fetches a vendor page.
          </p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {q.data.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span className="tabular">{c.key}</span> · {c.vendor} · {humanize(c.kind)} ·{' '}
                  <span className={cn(pill, 'border-gold/40 bg-gold-soft text-gold-bright')}>
                    {c.verification === 'verified' ? 'Independently verified' : 'Vendor-published'}
                  </span>
                </p>
                <blockquote className="mt-1 border-s-2 border-line-strong ps-3 text-sm text-ink">
                  {c.passage}
                </blockquote>
                {c.paraphrase ? (
                  <p className="mt-1 text-sm text-ink-muted">Paraphrase: {c.paraphrase}</p>
                ) : null}
                <p className="mt-1 text-xs text-ink-muted">
                  <a
                    href={c.sourceUrl}
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-cyan underline underline-offset-2"
                  >
                    {c.pageTitle}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>{' '}
                  · retrieved {formatDateTime(c.retrievedAt)}
                  {c.curatedBy ? ` · ${humanize(c.status)} by ${c.curatedBy}: ${c.curationNote}` : ''}
                </p>
                {o.canCurate && c.status === 'candidate' ? <CurateForm c={c} /> : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Panel>
  );
}

function Changes({ o }: { o: CiOverview }) {
  return (
    <Panel aria-labelledby="changes-heading">
      <PanelHeader
        id="changes-heading"
        title="Change feed"
        description="New pages and pages whose text changed between crawls, newest first. Unchanged pages are not stored again."
      />
      {o.changes.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">No pages collected yet.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {o.changes.map((c) => (
            <li key={`${c.url}:${c.version}`} className="px-5 py-3 text-sm">
              <span className="font-medium text-ink">{c.vendor}</span> ·{' '}
              {c.kind === 'new_page' ? 'New page' : `Changed (version ${c.version})`} ·{' '}
              <a href={c.url} rel="noreferrer" className="text-cyan underline underline-offset-2">
                {c.title}
              </a>
              <span className="block text-xs text-ink-muted">
                {formatDateTime(c.retrievedAt)} · {c.runKey}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Runs({ o }: { o: CiOverview }) {
  return (
    <Panel aria-labelledby="ci-runs-heading">
      <PanelHeader
        id="ci-runs-heading"
        title="Crawl runs"
        description={`${o.rules.version}: robots.txt first, sitemaps, at least ${o.rules.minDelaySeconds}s between requests, at most ${o.rules.maxPagesPerRun} pages per run. User agent: ${o.rules.userAgent}.`}
      />
      {o.runs.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">No crawl has been run.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {o.runs.map((r) => (
            <li key={r.key} className="px-5 py-3 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="tabular font-medium text-ink">{r.key}</span>
                <span className={cn(pill, RUN_TONE[r.status])}>{humanize(r.status)}</span>
                <span className="text-ink-muted">
                  {r.vendor} · {formatDateTime(r.startedAt)} · {r.startedBy ?? 'Scheduled'}
                </span>
              </p>
              <p className="tabular mt-1 text-xs text-ink-muted">
                robots {r.robotsStatus ?? '—'} · {r.pagesFetched} fetched · {r.pagesChanged} changed ·{' '}
                {r.pagesSkipped} skipped · {r.claimsProposed} claims proposed
              </p>
              {r.error ? <p className="mt-1 break-words text-xs text-red">{r.error}</p> : null}
              {r.log.length ? (
                <details className="mt-1 text-xs text-ink-muted">
                  <summary className="cursor-pointer text-cyan">Run log ({r.log.length})</summary>
                  <ul className="mt-1 space-y-0.5 break-words">
                    {r.log.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Report() {
  const q = useQuery({ queryKey: ['ci', 'report'], queryFn: api.ciReport, staleTime: Infinity });
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const r = q.data;
  return (
    <article className="space-y-5 rounded-xl border border-line bg-panel px-6 py-5 print:border-0 print:px-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-ink">Competitive intelligence report</h2>
          <p className="text-xs text-ink-muted">
            {r.version} · generated {formatDateTime(r.generatedAt)}
          </p>
        </div>
        <Button onClick={() => window.print()} className="print:hidden">
          <Printer className="h-4 w-4" aria-hidden />
          Print
        </Button>
      </div>
      <p
        role="note"
        className="rounded-md border border-gold/40 bg-gold-soft px-3 py-2 text-sm text-gold-bright"
      >
        {r.label}
      </p>
      {r.vendors.map((v) => (
        <section key={v.host + v.pathPrefix} aria-label={v.vendor} className="border-t border-line pt-4">
          <h3 className="text-base text-ink">{v.vendor}</h3>
          <p className="text-xs text-ink-muted">
            {v.category} · {v.host}
            {v.pathPrefix !== '/' ? v.pathPrefix : ''} ·{' '}
            {v.collected
              ? `collected, last ${v.lastSuccessAt ? formatDateTime(v.lastSuccessAt) : ''}`
              : `not collected${v.lastError ? `: ${v.lastError}` : ''}`}
          </p>
          {v.claims.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">No accepted claims.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {v.claims.map((c) => (
                <li key={c.id}>
                  “{c.passage}”{' '}
                  <span className="text-ink-muted">
                    ({c.verification === 'verified' ? 'verified' : 'vendor-published'})
                  </span>
                  <span className="block text-xs text-ink-muted">
                    Source:{' '}
                    <a href={c.sourceUrl} className="text-cyan underline underline-offset-2">
                      {c.sourceUrl}
                    </a>
                    , retrieved {formatDateTime(c.retrievedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}

const VIEWS = [
  { value: 'vendors', label: 'Vendors' },
  { value: 'claims', label: 'Claims' },
  { value: 'changes', label: 'Changes' },
  { value: 'runs', label: 'Crawl runs' },
  { value: 'report', label: 'Report' },
] as const;

export function CompetitivePage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = useQuery({
    queryKey: ['ci'],
    queryFn: api.ci,
    refetchInterval: (query) => (query.state.data?.runs.some((r) => r.status === 'running') ? 3000 : false),
  });
  const requested = params.get('tab');
  const tab = VIEWS.some((v) => v.value === requested) ? requested! : 'vendors';
  return (
    <>
      <PageHeader
        title={t('nav.competitive')}
        description="What five named vendors publish about themselves, collected politely from their public websites. Kept separate from cases, portfolios and decision reports; claims are the vendor's own words unless independently verified."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        <Tabs.Root value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <Tabs.List
            aria-label="Competitive intelligence"
            className="mb-5 flex flex-wrap gap-1 border-b border-line"
          >
            {VIEWS.map((x) => (
              <Tabs.Trigger key={x.value} value={x.value} className={tabClass}>
                {x.label}
                {tab === x.value ? (
                  <motion.span
                    layoutId="ci-tab-indicator"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-gold"
                    transition={INDICATOR_SPRING}
                    aria-hidden
                  />
                ) : null}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="vendors" className="outline-none">
            <Vendors o={q.data} />
          </Tabs.Content>
          <Tabs.Content value="claims" className="outline-none">
            <Claims o={q.data} />
          </Tabs.Content>
          <Tabs.Content value="changes" className="outline-none">
            <Changes o={q.data} />
          </Tabs.Content>
          <Tabs.Content value="runs" className="outline-none">
            <Runs o={q.data} />
          </Tabs.Content>
          <Tabs.Content value="report" className="outline-none">
            <Report />
          </Tabs.Content>
        </Tabs.Root>
      ) : null}
    </>
  );
}
