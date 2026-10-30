import cookie from '@fastify/cookie';
import Fastify, { type FastifyError } from 'fastify';
import type { Db } from './db/client';
import { DemoIdentityProvider } from './modules/auth/identity';
import { authRoutes } from './modules/auth/routes';
import { caseRoutes } from './modules/cases';
import { commandCentreRoutes } from './modules/command-centre';
import type { AppDeps } from './modules/context';
import { graphRoutes } from './modules/graph';
import { ingestionRoutes } from './modules/ingestion';
import { scenarioRoutes } from './modules/scenarios';
import { governanceRoutes } from './modules/governance';
import { portfolioRoutes } from './modules/portfolio';
import { searchRoutes } from './modules/search';
import { sectorRoutes } from './modules/sectors';
import { signalRoutes } from './modules/signals';
import { sourceRoutes } from './modules/sources';

export interface BuildOptions {
  db: Db;
  sessionSecret: string;
  demoInstitutionKey: string;
  demoInstitutionCode?: string;
  secureCookies?: boolean;
  logger?: boolean;
}

export async function buildApp(opts: BuildOptions) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: false });
  await app.register(cookie, { secret: opts.sessionSecret });
  app.decorateRequest('ctx', null);

  const deps: AppDeps = {
    db: opts.db,
    identity: new DemoIdentityProvider(opts.secureCookies ?? false),
    demoInstitutionKey: opts.demoInstitutionKey,
    demoInstitutionCode: opts.demoInstitutionCode ?? 'GSIA-DEMO',
  };

  // Never expose stack traces, SQL or sensitive text to clients (TRD §11.2).
  app.setErrorHandler((err: FastifyError, request, reply) => {
    request.log.error(err);
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? 'internal_error' : 'bad_request' });
  });

  app.get('/api/health', async () => ({ status: 'ok', environment: 'demonstration' }));
  await authRoutes(app, deps);
  await commandCentreRoutes(app, deps);
  await caseRoutes(app, deps);
  await sourceRoutes(app, deps);
  await signalRoutes(app, deps);
  await graphRoutes(app, deps);
  await ingestionRoutes(app, deps);
  await searchRoutes(app, deps);
  await sectorRoutes(app, deps);
  await scenarioRoutes(app, deps);
  await governanceRoutes(app, deps);
  await portfolioRoutes(app, deps);
  return app;
}
