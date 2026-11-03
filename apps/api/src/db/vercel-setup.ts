/**
 * Database setup for the Vercel demonstration, run during the build (the build can reach Neon; nothing else can).
 * As Neon's owner role: create the non-owner `tigeris_app` role if missing (NOBYPASSRLS), apply pending forward-only
 * migrations, and seed the fictional demonstration institutions only when the database is empty. It never drops or
 * resets anything, so a redeploy keeps the data people created.
 */
import postgres from 'postgres';
import { migrate } from './migrate';
import { seedAll } from './seed';

const ownerUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_OWNER_URL;
const appPassword = process.env.TIGERIS_APP_PASSWORD;

async function main() {
  if (!ownerUrl || !appPassword) {
    console.log('[vercel-setup] No Neon database or TIGERIS_APP_PASSWORD: skipping database setup.');
    return;
  }
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    const [exists] = await sql`select 1 from pg_roles where rolname = 'tigeris_app'`;
    if (!exists) await sql.unsafe('create role tigeris_app nosuperuser nobypassrls nocreatedb nocreaterole');
    // The password comes from the environment and is never logged. Role DDL takes no bind parameters, so the
    // literal is escaped (single quotes doubled); it is a generated secret, not user input.
    await sql.unsafe(`alter role tigeris_app with login password '${appPassword.replace(/'/g, "''")}'`);
    const [db] = await sql<{ d: string }[]>`select current_database() as d`;
    await sql.unsafe(`grant connect on database "${db!.d}" to tigeris_app`);
    await sql.unsafe('grant usage on schema public to tigeris_app');
  } finally {
    await sql.end({ timeout: 5 });
  }
  const ran = await migrate(ownerUrl);
  console.log(`[vercel-setup] migrations applied: ${ran.length ? ran.join(', ') : 'none pending'}`);
  const check = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    // Institutions have forced row-level security, so ask through the resolver the demo sign-in already uses.
    const [demo] = await check<{ id: string | null }[]>`select resolve_institution_id('gsia-demo') as id`;
    if (demo?.id) {
      console.log('[vercel-setup] demonstration data present; not seeding again.');
      return;
    }
  } finally {
    await check.end({ timeout: 5 });
  }
  await seedAll(ownerUrl);
  console.log('[vercel-setup] seeded the fictional demonstration institutions.');
}

main().catch((err) => {
  console.error('[vercel-setup] failed:', (err as Error).message);
  process.exit(1);
});
