import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { SectorSubnav } from '@/components/layout/SectorSubnav';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { DataModeBadge, StateBadge, UrgencyBadge } from '@/components/truth/badges';
import { Panel } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { formatRelative, humanize } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/roles';

export function CasesListPage() {
  const q = useQuery({ queryKey: ['cases'], queryFn: api.cases });
  return (
    <>
      <SectorSubnav />
      <PageHeader
        title="Intelligence Cases"
        description="Every signal, piece of evidence, scenario and decision attaches to a case."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="sr-only">Cases in your institution</caption>
            <thead>
              <tr className="border-b border-line bg-raised/50 text-xs text-ink-muted">
                <th scope="col" className="px-5 py-3 text-start font-medium">
                  Case
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  State
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Labels
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Next step
                </th>
                <th scope="col" className="px-5 py-3 text-start font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.map((c) => (
                <tr key={c.id} className="hover:bg-raised/50">
                  <td className="px-5 py-3">
                    <Link to={`/cases/${c.key}`} className="font-medium text-ink hover:underline">
                      {c.title}
                    </Link>
                    <span className="block text-xs text-ink-muted">
                      <span className="tabular font-mono">{c.key}</span> · {c.domain} ·{' '}
                      {humanize(c.sensitivity)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StateBadge value={c.state} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex flex-wrap gap-1">
                      <UrgencyBadge value={c.urgency} />
                      <DataModeBadge value={c.dataMode} />
                    </span>
                  </td>
                  <td className="px-3 py-3 text-ink">
                    {c.nextStep}
                    {c.nextStepRole ? (
                      <span className="block text-xs text-ink-muted">{ROLE_LABEL[c.nextStepRole]}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-ink-muted">{formatRelative(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}
    </>
  );
}
