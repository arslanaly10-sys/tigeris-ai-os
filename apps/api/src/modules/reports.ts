/**
 * Governance-ready case report and JSON evidence pack (slice I, FR-38, FR-39).
 *
 * The pack is composed from the same endpoints the screens use, called in-process with the reader's own session, so
 * every scope filter (clearance, workspaces, institution) applies unchanged and the report can never contain a record
 * the reader could not open. Only roles that work with case content may export, and every export is audited.
 */
import { createHash } from 'node:crypto';
import type {
  AnalysisRunItem,
  CaseAnalysisPayload,
  CaseDetail,
  CaseGovernance,
  CaseReport,
  GraphPayload,
  OutcomeReviewPayload,
  Role,
  ScenarioRunDetail,
} from '@tigeris/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit, canonicalJson } from '../audit/audit';
import { withInstitution } from '../db/client';
import { cases, institutions } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';

export const REPORT_VERSION = 'case-report 1.0.0';
export const EXPORT_ROLES: readonly Role[] = ['executive', 'analyst', 'domain_expert', 'approver', 'auditor'];
const LABEL =
  'Demonstration: fictional institution, synthetic and dated public snapshot data. No live feeds. Not investment advice; no action has been executed by TIGERIS.';

export async function reportRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/cases/:key/report', guard, async (request, reply) => {
    const p = z.object({ key: z.string().regex(/^[A-Z0-9-]{3,40}$/) }).safeParse(request.params);
    const q = z
      .object({
        format: z.enum(['json', 'print']).default('json'),
        download: z.coerce.boolean().default(false),
      })
      .safeParse(request.query);
    if (!p.success || !q.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    if (!EXPORT_ROLES.some((r) => ctx.roles.includes(r)))
      return reply.code(403).send({ error: 'not_permitted' });

    const headers = { cookie: request.headers.cookie ?? '' };
    const read = async <T>(url: string): Promise<T | null> => {
      const res = await app.inject({ method: 'GET', url, headers });
      return res.statusCode === 200 ? (res.json() as T) : null;
    };
    const key = encodeURIComponent(p.data.key);
    const kase = await read<CaseDetail>(`/api/cases/${key}`);
    if (!kase) return reply.code(404).send({ error: 'not_found' });
    const [graph, gov, analysis] = await Promise.all([
      read<GraphPayload>(`/api/cases/${key}/graph`),
      read<CaseGovernance>(`/api/cases/${key}/governance`),
      read<CaseAnalysisPayload>(`/api/cases/${key}/analysis`),
    ]);
    const scenario = gov?.latestRunKey
      ? await read<ScenarioRunDetail>(`/api/scenarios/${gov.latestRunKey}`)
      : null;
    const outcomes = gov?.memory
      ? await read<OutcomeReviewPayload>(`/api/memory/${gov.memory.key}/outcomes`)
      : null;

    const report = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [inst] = await tx.select().from(institutions).where(eq(institutions.id, ctx.institutionId));
      const [c] = await tx.select({ id: cases.id }).from(cases).where(eq(cases.key, p.data.key));
      const body: Omit<CaseReport, 'contentHash'> = {
        version: REPORT_VERSION,
        label: LABEL,
        generatedAt: new Date().toISOString(),
        generatedBy: { name: ctx.displayName, title: ctx.title, roles: ctx.roles },
        institution: { name: inst!.name, isSynthetic: inst!.isSynthetic },
        case: kase,
        graph: graph ?? { nodes: [], edges: [], maxHops: 0 },
        scenario,
        governance: {
          caseKey: gov!.caseKey,
          caseState: gov!.caseState,
          latestRunKey: gov!.latestRunKey,
          candidateOptions: gov!.candidateOptions,
          recommendations: gov!.recommendations,
          open: gov!.open,
          handoff: gov!.handoff,
          memory: gov!.memory,
          notes: gov!.notes,
        },
        analysis: (analysis?.runs[0] as AnalysisRunItem | undefined) ?? null,
        outcomes,
      };
      const contentHash = createHash('sha256').update(canonicalJson(body)).digest('hex');
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'report.exported',
        objectType: 'case',
        objectId: c!.id,
        caseId: c!.id,
        payload: { case: p.data.key, format: q.data.format, version: REPORT_VERSION, contentHash },
      });
      return { ...body, contentHash };
    });

    if (q.data.download)
      reply.header(
        'content-disposition',
        `attachment; filename="${p.data.key}-evidence-pack-${report.generatedAt.slice(0, 10)}.json"`,
      );
    return report;
  });
}
