/**
 * Ask TIGERIS (Phase 5G, FR-58, D-121). A question is answered from the institution's own records the reader may
 * read: cases, institutional memory, evidence, signals and approved definitions. Retrieval is deterministic (terms
 * matched, records ranked by how many terms they contain); the answer quotes the cited records and nothing else.
 * No model is called; when nothing matches, the answer says so instead of guessing.
 */
import { SENSITIVITY_ORDER, type AskAnswer, type AskCitation, type Sensitivity } from '@tigeris/shared';
import { createHash } from 'node:crypto';
import { and, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { withInstitution } from '../db/client';
import { cases, evidenceObjects, memoryEntries, semanticDefinitions, signals } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';
import { claudeDraft } from './claude';
import { caseReadable } from './scope';

export const ASK_VERSION = 'ask 1.0.0';
const STOP = new Set(
  'the a an and or of to in on for with what which who whom how why when where is are was were be been does did do has have had our we us it its this that these those about from by at as any all can could would should will there their they them than then into over under per not no yes'.split(
    ' ',
  ),
);

/** Up to six distinct content words of three letters or more, in the order asked. */
export function terms(question: string): string[] {
  const words = question.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? [];
  return [...new Set(words.filter((w) => !STOP.has(w)))].slice(0, 6);
}

const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);
const anyTerm = (cols: PgColumn[], ts: string[]): SQL =>
  or(...ts.flatMap((t) => cols.map((c) => ilike(c, `%${escapeLike(t)}%`))))!;
const hits = (text: string, ts: string[]) => ts.filter((t) => text.toLowerCase().includes(t)).length;

/** The sentence of a text that contains the most terms, trimmed to a readable length. */
function excerpt(text: string, ts: string[]): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const best = sentences.reduce((a, b) => (hits(b, ts) > hits(a, ts) ? b : a), sentences[0] ?? '');
  return best.length > 240 ? `${best.slice(0, 237)}…` : best;
}

export async function askRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post(
    '/api/ask',
    { preHandler: requireSession(deps) },
    async (request, reply): Promise<AskAnswer | undefined> => {
      const body = z.object({ question: z.string().trim().min(3).max(500) }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      const ctx = ctxOf(request);
      const ts = terms(body.data.question);
      return withInstitution(deps.db, ctx.institutionId, async (tx) => {
        const citations: (AskCitation & { score: number; sensitivity?: Sensitivity })[] = [];
        if (ts.length) {
          const [c, m, e, s, d] = await Promise.all([
            tx
              .select()
              .from(cases)
              .where(
                and(
                  anyTerm([cases.title, cases.summary, cases.objective, cases.key], ts),
                  caseReadable(ctx.scope),
                ),
              )
              .limit(20),
            tx
              .select({ m: memoryEntries, caseKey: cases.key, sensitivity: cases.sensitivity })
              .from(memoryEntries)
              .innerJoin(cases, eq(cases.id, memoryEntries.caseId))
              .where(
                and(
                  anyTerm(
                    [
                      memoryEntries.title,
                      memoryEntries.lesson,
                      memoryEntries.outcome,
                      memoryEntries.decisionRationale,
                    ],
                    ts,
                  ),
                  caseReadable(ctx.scope),
                ),
              )
              .limit(20),
            tx
              .select()
              .from(evidenceObjects)
              .where(anyTerm([evidenceObjects.title, evidenceObjects.summary], ts))
              .limit(20),
            tx
              .select()
              .from(signals)
              .where(anyTerm([signals.title, signals.summary], ts))
              .limit(20),
            tx
              .select()
              .from(semanticDefinitions)
              .where(
                and(
                  eq(semanticDefinitions.status, 'approved'),
                  anyTerm([semanticDefinitions.label, semanticDefinitions.description], ts),
                ),
              )
              .limit(20),
          ]);
          for (const x of c) {
            const text = `${x.title}. ${x.summary} ${x.objective}`;
            citations.push({
              kind: 'case',
              ref: x.key,
              title: x.title,
              excerpt: excerpt(`${x.summary} ${x.objective}`, ts),
              href: `/cases/${x.key}`,
              label: 'Case',
              score: hits(text, ts),
              sensitivity: x.sensitivity as Sensitivity,
            });
          }
          for (const { m: x, caseKey, sensitivity } of m) {
            const text = `${x.title}. ${x.lesson} ${x.outcome} ${x.decisionRationale}`;
            citations.push({
              kind: 'memory',
              ref: x.key,
              title: x.title,
              excerpt: excerpt(`${x.lesson} ${x.outcome}`, ts),
              href: `/cases/${caseKey}`,
              label: 'Institutional memory',
              score: hits(text, ts) + 1,
              sensitivity: sensitivity as Sensitivity,
            });
          }
          for (const x of e) {
            const text = `${x.title}. ${x.summary}`;
            citations.push({
              kind: 'evidence',
              ref: x.externalId,
              title: x.title,
              excerpt: excerpt(x.summary, ts),
              href: null,
              label: `Evidence, ${x.validationStatus}`,
              score: hits(text, ts),
            });
          }
          for (const x of s) {
            const text = `${x.title}. ${x.summary}`;
            citations.push({
              kind: 'signal',
              ref: x.key,
              title: x.title,
              excerpt: excerpt(x.summary, ts),
              href: '/signals',
              label: `Signal, ${x.dataMode}`,
              score: hits(text, ts),
            });
          }
          for (const x of d) {
            const text = `${x.label}. ${x.description}`;
            citations.push({
              kind: 'definition',
              ref: x.key,
              title: x.label,
              excerpt: excerpt(x.description, ts),
              href: '/mandates?view=definitions',
              label: 'Approved definition',
              score: hits(text, ts),
            });
          }
        }
        const top = citations.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref)).slice(0, 6);
        const deterministic = top.length
          ? `${top.length} record${top.length === 1 ? '' : 's'} you may read match${top.length === 1 ? 'es' : ''} this question. ` +
            top.map((t, i) => `[${i + 1}] ${t.label} ${t.ref}: ${t.excerpt}`).join(' ')
          : 'No record you may read answers this question. TIGERIS does not guess; try other words, or ask an analyst to open a case.';
        // Claude may rewrite the answer from these citations only (5I); the markers are part of each display so
        // the grounding check accepts "[n]" references.
        const drafted = await claudeDraft(
          tx,
          ctx,
          'ask',
          body.data.question,
          top.map((t, i) => ({
            ref: t.ref,
            label: t.label,
            display: `[${i + 1}] ${t.ref} ${t.title}: ${t.excerpt}`,
          })),
          deterministic,
          null,
          // The most sensitive cited record decides whether the answer may go to an external model.
          SENSITIVITY_ORDER[
            Math.max(0, ...top.map((t) => SENSITIVITY_ORDER.indexOf(t.sensitivity ?? 'internal')))
          ]!,
        );
        await appendAudit(tx, {
          institutionId: ctx.institutionId,
          actorPrincipalId: ctx.principalId,
          actorType: 'human',
          action: 'ask.answered',
          objectType: 'question',
          objectId: null,
          caseId: null,
          // The question itself may be sensitive; the log keeps its hash and what was cited.
          payload: {
            version: ASK_VERSION,
            questionSha256: createHash('sha256').update(body.data.question).digest('hex'),
            citations: top.map((t) => `${t.kind}:${t.ref}`),
            drafter: drafted.drafter,
          },
        });
        return {
          version: ASK_VERSION,
          question: body.data.question,
          terms: ts,
          answer: drafted.text,
          drafter: drafted.drafter,
          citations: top.map(({ score: _score, sensitivity: _s, ...c }) => c),
        };
      });
    },
  );
}
