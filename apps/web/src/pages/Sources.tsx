import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { SourceClassBadge } from '@/components/truth/badges';
import { Panel } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';

export function SourcesPage() {
  const q = useQuery({ queryKey: ['sources'], queryFn: api.sources });
  return (
    <>
      <PageHeader
        title="Data & Sources"
        description="Source registry: class, terms, approval and freshness. Unapproved sources cannot support decisions. Connectors and quarantine arrive in Phase 2."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Registered sources</caption>
            <thead>
              <tr className="border-b border-line bg-ivory text-xs text-ink-muted">
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
                <tr key={s.id} id={s.key} className="target:bg-gold-soft">
                  <td className="px-5 py-3 align-top">
                    <span className="font-medium text-ink">{s.publisher}</span>
                    <span className="block text-ink-muted">{s.title}</span>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-navy-700 underline underline-offset-2"
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
                    <span className="block text-xs text-ink-muted">
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
    </>
  );
}
