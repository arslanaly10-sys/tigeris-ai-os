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
  /** Where uploaded files are stored (outside the web root). Relative paths resolve from apps/api. */
  UPLOAD_DIR: z.string().default(fileURLToPath(new URL('../var/uploads', import.meta.url))),
  /** Background jobs (pg-boss) for scheduled connector syncs and crawls. Off in tests. */
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * Optional model-provider endpoint (local OpenAI-compatible server or hosted provider). Recorded and shown as
   * configured, never called while external model calls are disabled by policy (D-14).
   */
  MODEL_PROVIDER_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
});

export const config = schema.parse(process.env);
export type Config = typeof config;
