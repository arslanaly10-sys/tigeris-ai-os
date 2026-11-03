/**
 * Vercel deployment (demonstration only). The Fastify API runs as one Vercel Function behind /api, on the same domain
 * as the web app, so session cookies and the Content-Security-Policy stay same-origin. It connects as the non-owner
 * `tigeris_app` role with row-level security, exactly as in every other deployment. Background jobs are off.
 *
 * Neon (Vercel Marketplace) provides the database URLs. The app-role URL is derived from Neon's pooled URL with the
 * `tigeris_app` credentials, unless DATABASE_APP_URL is set explicitly.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';
import { disabledJobs } from './jobs';

/** The app-role URL: explicit, or Neon's pooled URL with the tigeris_app user and password. */
export function appDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_APP_URL) return env.DATABASE_APP_URL;
  const pooled = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (!pooled || !env.TIGERIS_APP_PASSWORD)
    throw new Error('Set DATABASE_APP_URL, or connect Neon and set TIGERIS_APP_PASSWORD.');
  const u = new URL(pooled);
  u.username = 'tigeris_app';
  u.password = env.TIGERIS_APP_PASSWORD;
  return u.toString();
}

let ready: Promise<FastifyInstance> | undefined;

async function init(): Promise<FastifyInstance> {
  // Neon's pooler runs in transaction mode: no prepared statements. Scope is per transaction, so pooling is safe.
  const { db } = createDb(appDatabaseUrl(), 5, { prepare: false });
  const app = await buildApp({
    db,
    sessionSecret: config.SESSION_SECRET,
    demoInstitutionKey: config.DEMO_INSTITUTION_KEY,
    demoInstitutionCode: config.DEMO_INSTITUTION_CODE,
    secureCookies: true,
    logger: true,
    jobs: disabledJobs,
  });
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await (ready ??= init());
  app.server.emit('request', req, res);
}
