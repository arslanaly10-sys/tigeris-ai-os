import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';
import { disabledJobs, startJobs } from './jobs';

const { db } = createDb(config.DATABASE_APP_URL);
async function jobsOrDisabled() {
  if (!config.JOBS_ENABLED) return disabledJobs;
  try {
    return await startJobs(db, config.DATABASE_APP_URL);
  } catch (err) {
    // Scheduling is refused with a clear message rather than taking the API down.
    console.error('[jobs] background jobs unavailable:', (err as Error).message);
    return disabledJobs;
  }
}
const jobs = await jobsOrDisabled();
const app = await buildApp({
  db,
  sessionSecret: config.SESSION_SECRET,
  demoInstitutionKey: config.DEMO_INSTITUTION_KEY,
  demoInstitutionCode: config.DEMO_INSTITUTION_CODE,
  secureCookies: config.NODE_ENV === 'production',
  logger: true,
  jobs,
});

await app.listen({ port: config.API_PORT, host: '127.0.0.1' });
