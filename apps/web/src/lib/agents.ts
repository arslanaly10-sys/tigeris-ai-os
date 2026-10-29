import type { AgentRunItem } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';

export interface AgentStat {
  count: number;
  lastAt: string;
}

/** Recorded runs per specialist. Counts come from the agent_runs register, never from the registry alone. */
export function useAgentRunStats() {
  const q = useQuery({ queryKey: ['agent-runs'], queryFn: api.agentRuns });
  const stats = new Map<string, AgentStat>();
  for (const r of q.data ?? []) {
    const s = stats.get(r.agentKey);
    if (!s) stats.set(r.agentKey, { count: 1, lastAt: r.startedAt });
    else s.count += 1;
  }
  return { query: q, stats };
}

export const runsLabel = (s: AgentStat | undefined) =>
  s ? `${s.count} run${s.count === 1 ? '' : 's'} · ${formatRelative(s.lastAt)}` : null;

export type { AgentRunItem };
