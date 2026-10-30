import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyError } from 'fastify';
import { MAX_UPLOAD_BYTES } from './connectors/parse';
import type { Db } from './db/client';
import { disabledJobs, type JobScheduler } from './jobs';
import { DemoIdentityProvider } from './modules/auth/identity';
import { authRoutes } from './modules/auth/routes';
import { caseRoutes } from './modules/cases';
import { analysisRoutes } from './modules/analysis';
import { oversightRoutes } from './modules/oversight';
import { semanticRoutes } from './modules/semantic';
import { reportRoutes } from './modules/reports';
import { ciRoutes } from './modules/ci';
import { connectorRoutes } from './modules/connectors';
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
  /** Background job scheduler; omitted in tests, where scheduling is refused with a clear message. */
  jobs?: JobScheduler;
  /** Network access for the competitive-intelligence crawler (tests pass a stub). */
  ciNetwork?: { fetch: typeof fetch; sleep?: (ms: number) => Promise<void> };
}

export async function buildApp(opts: BuildOptions) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: false });
  await app.register(cookie, { secret: opts.sessionSecret });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5, parts: 6 } });
  app.decorateRequest('ctx', null);

  const deps: AppDeps = {
    db: opts.db,
    identity: new DemoIdentityProvider(opts.secureCookies ?? false),
    demoInstitutionKey: opts.demoInstitutionKey,
    demoInstitutionCode: opts.demoInstitutionCode ?? 'GSIA-DEMO',
    jobs: opts.jobs ?? disabledJobs,
    ciNetwork: opts.ciNetwork,
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
  await connectorRoutes(app, deps);
  await analysisRoutes(app, deps);
  await oversightRoutes(app, deps);
  await reportRoutes(app, deps);
  await ciRoutes(app, deps);
  await semanticRoutes(app, deps);
  return app;
}
