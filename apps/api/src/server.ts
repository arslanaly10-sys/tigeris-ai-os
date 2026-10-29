import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';

const { db } = createDb(config.DATABASE_APP_URL);
const app = await buildApp({
  db,
  sessionSecret: config.SESSION_SECRET,
  demoInstitutionKey: config.DEMO_INSTITUTION_KEY,
  demoInstitutionCode: config.DEMO_INSTITUTION_CODE,
  secureCookies: config.NODE_ENV === 'production',
  logger: true,
});

await app.listen({ port: config.API_PORT, host: '127.0.0.1' });
