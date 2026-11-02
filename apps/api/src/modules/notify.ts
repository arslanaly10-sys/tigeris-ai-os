/**
 * Intervention alerts outside the app (Phase 5G, D-110, D-121). The in-app inbox is always on. Microsoft Teams
 * (incoming webhook) and email (an HTTPS relay the institution runs) are off until configured in the environment.
 * An alert carries the key, severity and a link; its title only when the intervention is internal, so restricted
 * and confidential detail never leaves TIGERIS. A delivery counts only when the receiving service accepted it, and
 * every attempt is audited. Nothing here acts on anything.
 */
import type { NotificationChannel, Sensitivity } from '@tigeris/shared';
import { desc, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { appendAudit } from '../audit/audit';
import { config } from '../config';
import { withInstitution, type Db } from '../db/client';
import { auditEvents } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';

interface Raised {
  key: string;
  severity: 'breach' | 'attention';
  title: string;
  classification: Sensitivity;
}

const configured = () => ({
  teams: !!config.TEAMS_WEBHOOK_URL,
  email: !!(config.EMAIL_RELAY_URL && config.EMAIL_TO),
});

/** What an alert may say: no restricted or confidential detail leaves the institution's system. */
export function alertText(i: Raised): { subject: string; body: string } {
  const what =
    i.classification === 'internal' ? i.title : `A ${i.classification} intervention needs attention`;
  const subject = `TIGERIS ${i.severity === 'breach' ? 'breach' : 'attention'}: ${i.key}`;
  return { subject, body: `${what}. Open it in TIGERIS: ${config.APP_BASE_URL}/interventions` };
}

async function post(url: string, payload: object, token?: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message.slice(0, 200) };
  }
}

/** Sends alerts for newly raised interventions on each configured channel and audits every attempt. */
export async function notifyRaised(db: Db, institutionId: string, raised: Raised[]) {
  const on = configured();
  const results: { key: string; channel: 'teams' | 'email'; ok: boolean; detail: string }[] = [];
  if (!raised.length || (!on.teams && !on.email)) return results;
  for (const i of raised) {
    const { subject, body } = alertText(i);
    if (on.teams)
      results.push({
        key: i.key,
        channel: 'teams',
        ...(await post(config.TEAMS_WEBHOOK_URL!, { text: `**${subject}**\n\n${body}` })),
      });
    if (on.email)
      results.push({
        key: i.key,
        channel: 'email',
        ...(await post(
          config.EMAIL_RELAY_URL!,
          { to: config.EMAIL_TO!.split(',').map((x) => x.trim()), subject, text: body },
          config.EMAIL_RELAY_TOKEN,
        )),
      });
  }
  await withInstitution(db, institutionId, async (tx) => {
    for (const r of results)
      await appendAudit(tx, {
        institutionId,
        actorPrincipalId: null,
        actorType: 'service',
        action: r.ok ? 'notification.sent' : 'notification.failed',
        objectType: 'intervention',
        objectId: null,
        caseId: null,
        payload: { key: r.key, channel: r.channel, result: r.detail },
      });
  });
  return results;
}

export async function notifyRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get(
    '/api/notifications/channels',
    { preHandler: requireSession(deps) },
    async (request): Promise<NotificationChannel[]> => {
      const ctx = ctxOf(request);
      const on = configured();
      return withInstitution(deps.db, ctx.institutionId, async (tx) => {
        const last = async (channel: 'teams' | 'email') => {
          const rows = await tx
            .select({ action: auditEvents.action, payload: auditEvents.payload, at: auditEvents.occurredAt })
            .from(auditEvents)
            .where(like(auditEvents.action, 'notification.%'))
            .orderBy(desc(auditEvents.seq))
            .limit(50);
          const r = rows.find((x) => (x.payload as { channel?: string }).channel === channel);
          return r
            ? {
                ok: r.action === 'notification.sent',
                at: new Date(r.at).toISOString(),
                detail: String((r.payload as { result?: string }).result ?? ''),
              }
            : null;
        };
        return [
          {
            key: 'inbox',
            label: 'In-app intervention inbox',
            status: 'on',
            detail: 'Always on; routed by role within read scope.',
            lastDelivery: null,
          },
          {
            key: 'teams',
            label: 'Microsoft Teams',
            status: on.teams ? 'configured' : 'off',
            detail: on.teams
              ? 'Incoming webhook set (TEAMS_WEBHOOK_URL).'
              : 'Off until TEAMS_WEBHOOK_URL is set in the environment.',
            lastDelivery: await last('teams'),
          },
          {
            key: 'email',
            label: 'Email',
            status: on.email ? 'configured' : 'off',
            detail: on.email
              ? `HTTPS relay set; ${config.EMAIL_TO!.split(',').length} recipient(s).`
              : 'Off until EMAIL_RELAY_URL and EMAIL_TO are set in the environment.',
            lastDelivery: await last('email'),
          },
        ];
      });
    },
  );
}
