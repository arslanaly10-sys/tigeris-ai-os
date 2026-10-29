import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const schema = z.object({
  DATABASE_OWNER_URL: z.string().default('postgres://tigeris_owner:tigeris_owner_dev@localhost:5432/tigeris'),
  DATABASE_APP_URL: z.string().default('postgres://tigeris_app:tigeris_app_dev@localhost:5432/tigeris'),
  SESSION_SECRET: z.string().min(32).default('dev-only-change-me-dev-only-change-me'),
  DEMO_INSTITUTION_KEY: z.string().default('gsia-demo'),
  DEMO_INSTITUTION_CODE: z.string().default('GSIA-DEMO'),
  API_PORT: z.coerce.number().int().default(4000),
  NODE_ENV: z.string().default('development'),
});

export const config = schema.parse(process.env);
export type Config = typeof config;
