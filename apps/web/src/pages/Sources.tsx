import type { AuthContext, IngestionJobItem } from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, ExternalLink, PackageCheck, PackageX, TriangleAlert } from 'lucide-react';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { OutcomeBadge, SourceClassBadge } from '@/components/truth/badges';
import { Button } from '@/components/ui/button';
import { Panel, PanelFooter, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, humanize } from '@/lib/format';
import { AnimatePresence, motion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/components/ui/motion';

function JobCard({ job }: { job: IngestionJobItem }) {
  const Icon = job.status === 'rejected' ? PackageX : PackageCheck;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
      className="rounded-lg border border-line bg-raised/30"
    >
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
          <Icon
            className={cn('h-5 w-5', job.status === 'rejected' ? 'text-red' : 'text-emerald')}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{job.packageId}</span>
            <span className="text-xs text-ink-faint">
              {job.source ?? 'Unknown source'} · {formatDateTime(job.completedAt)} · {job.actor ?? 'service'}{' '}
              · {job.ruleSetVersion}
            </span>
          </span>
          <span className="flex flex-wrap gap-2 text-xs">
            <span className="text-emerald">{job.counts.accepted} accepted</span>
            {job.counts.warned ? <span className="text-amber">{job.counts.warned} warned</span> : null}
            {job.counts.quarantined ? (
              <span className="text-red">{job.counts.quarantined} quarantined</span>
            ) : null}
            {job.counts.rejected ? <span className="text-red">{job.counts.rejected} rejected</span> : null}
          </span>
        </summary>
        <div className="border-t border-line px-4 py-3">
          <p className="mb-2 break-all text-[12px] text-ink-faint">Package SHA-256 {job.packageSha256}</p>
          <ul className="space-y-3">
            {job.runs.map((r) => (
              <li key={r.id} className="rounded-md border border-line bg-panel px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <OutcomeBadge value={r.outcome} />
                  <span className="break-all text-xs text-ink-muted">{r.externalId}</span>
                </div>
                <p className="mt-1 text-sm text-ink">{r.rationale}</p>
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {r.checks.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      {c.result === 'pass' ? (
                        <CheckCircle2
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald"
                          aria-label="Pass"
                        />
                      ) : c.result === 'warn' ? (
                        <TriangleAlert
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber"
                          aria-label="Warning"
                        />
                      ) : (
                        <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red" aria-label="Fail" />
                      )}
                      <span>
                        <span className="font-medium text-ink">{humanize(c.rule)}:</span>{' '}
                        <span className="text-ink-muted">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </motion.li>
  );
}

export function SourcesPage({ ctx }: { ctx: AuthContext }) {
  const q = useQuery({ queryKey: ['sources'], queryFn: api.sources });
  const jobs = useQuery({ queryKey: ['ingestion'], queryFn: api.ingestion });
  const qc = useQueryClient();
  const isAdmin = ctx.principal.roles.includes('administrator');
  const sample = useMutation({
    mutationFn: api.runSampleIngestion,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['ingestion'] }),
        qc.invalidateQueries({ queryKey: ['sources'] }),
        qc.invalidateQueries({ queryKey: ['command-centre'] }),
      ]),
  });
  const quarantined = (jobs.data ?? []).flatMap((j) =>
    j.runs.filter((r) => r.outcome === 'quarantined').map((r) => ({ job: j, run: r })),
  );

  return (
    <>
      <PageHeader
        title="Data & Sources"
        description="Source registry, ingestion runs and quarantine. Unapproved sources cannot be ingested; failed records never reach cases, the graph or recommendations."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        <Panel className="overflow-x-auto">
          <PanelHeader title="Source registry" />
          <table className="w-full min-w-[56rem] border-t border-line text-sm">
            <caption className="sr-only">Registered sources</caption>
            <thead>
              <tr className="text-xs text-ink-faint">
                <th scope="col" className="px-5 py-3 text-start font-medium">
                  Source
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Class
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Approval
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Freshness
                </th>
                <th scope="col" className="px-5 py-3 text-start font-medium">
                  Terms
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.map((s) => (
                <tr key={s.id} id={s.key} className="target:bg-gold/10">
                  <td className="px-5 py-3 align-top">
                    <span className="font-medium text-ink">{s.publisher}</span>
                    <span className="block text-ink-muted">{s.title}</span>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-cyan underline underline-offset-2"
                      >
                        Open source <ExternalLink className="h-3 w-3" aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <SourceClassBadge value={s.sourceClass} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className={
                        s.approvalStatus === 'approved' ? 'text-emerald' : 'font-semibold text-amber'
                      }
                    >
                      {humanize(s.approvalStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top text-ink">
                    {s.freshness === 'not_applicable' ? (
                      'Dated snapshot'
                    ) : (
                      <span className={s.freshness === 'stale' ? 'font-semibold text-amber' : 'text-emerald'}>
                        {s.freshness === 'stale' ? 'Stale' : 'Fresh'}
                      </span>
                    )}
                    <span className="block text-xs text-ink-faint">
                      {s.freshnessLimitHours ? `Limit ${s.freshnessLimitHours} h · ` : ''}
                      Last retrieved {formatDate(s.lastRetrievedAt)}
                    </span>
                  </td>
                  <td className="px-5 py-3 align-top text-xs text-ink-muted">
                    {s.termsRef ?? 'Not recorded'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel aria-labelledby="ingestion-heading" className="flex flex-col">
          <PanelHeader
            id="ingestion-heading"
            title="Ingestion runs"
            description="Each package is hashed (idempotent) and every record is checked: source approval, schema, data class, integrity, timestamps, duplicates and freshness."
            action={
              isAdmin ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => sample.mutate()}
                  disabled={sample.isPending}
                >
                  Import synthetic sample package
                </Button>
              ) : null
            }
          />
          <div className="border-t border-line px-5 py-4">
            {!isAdmin ? (
              <p className="mb-3 text-xs text-ink-faint">
                Only governance administrators can import packages.
              </p>
            ) : null}
            {jobs.data ? (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {jobs.data.map((j) => (
                    <JobCard key={j.id} job={j} />
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <LoadState isPending={jobs.isPending} error={jobs.error} />
            )}
          </div>
          <PanelFooter>
            <span className="tabular">{jobs.data?.length ?? 0} ingestion runs recorded</span>
            <span>Every run is append-only</span>
          </PanelFooter>
        </Panel>

        <Panel aria-labelledby="quarantine-heading" className="flex flex-col">
          <PanelHeader
            id="quarantine-heading"
            title="Quarantine"
            description="Held records that failed integrity or time checks. Excluded from analysis until a source owner resolves them."
          />
          <ul className="divide-y divide-line border-t border-line">
            {quarantined.length === 0 ? (
              <li className="px-5 py-4 text-sm text-ink-muted">Nothing in quarantine.</li>
            ) : (
              quarantined.map(({ job, run }) => (
                <li key={run.id} className="px-5 py-3">
                  <p className="break-all text-xs text-ink">{run.externalId}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {run.checks
                      .filter((c) => c.result === 'fail')
                      .map((c) => c.detail)
                      .join(' ')}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-faint">Package {job.packageId}</p>
                </li>
              ))
            )}
          </ul>
          <PanelFooter>
            <span className="tabular">{quarantined.length} records held</span>
            <span>Resolved by the source owner</span>
          </PanelFooter>
        </Panel>
      </div>
    </>
  );
}
