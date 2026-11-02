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
  /** 127.0.0.1 locally; 0.0.0.0 inside a container. */
  API_HOST: z.string().default('127.0.0.1'),
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
  /** OpenID Connect sign-in (Entra ID: https://login.microsoftonline.com/<tenant>/v2.0). Off when the issuer is empty. */
  OIDC_ISSUER: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  OIDC_CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  OIDC_CLIENT_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  OIDC_REDIRECT_URI: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  /** The one institution this deployment signs people into. */
  OIDC_INSTITUTION_KEY: z.string().default('gsia-demo'),
  /** S3-compatible evidence store (MinIO, AWS S3). When the endpoint is empty, files stay on local disk. */
  EVIDENCE_S3_ENDPOINT: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  EVIDENCE_S3_BUCKET: z.string().default('tigeris-evidence'),
  EVIDENCE_S3_REGION: z.string().default('us-east-1'),
  EVIDENCE_S3_ACCESS_KEY_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  EVIDENCE_S3_SECRET_ACCESS_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  /** Microsoft Teams incoming-webhook address for intervention alerts. Off when empty (D-110). */
  TEAMS_WEBHOOK_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().startsWith('https://').optional(),
  ),
  /** HTTPS mail relay (your gateway's send API) for intervention alerts, its bearer token and the recipients. */
  EMAIL_RELAY_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().startsWith('https://').optional(),
  ),
  EMAIL_RELAY_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  EMAIL_TO: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  /** Address of the TIGERIS web app, used for links in alerts. */
  APP_BASE_URL: z.string().url().default('http://127.0.0.1:5173'),
  MODEL_PROVIDER_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
});

export const config = schema.parse(process.env);
export type Config = typeof config;
