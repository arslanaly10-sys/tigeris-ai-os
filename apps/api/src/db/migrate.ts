// Forward-only SQL migration runner. Runs as the owner role; records applied files.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { config } from '../config';

const dir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

export async function migrate(url = config.DATABASE_OWNER_URL): Promise<string[]> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(dir + file, 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      ran.push(file);
    }
    return ran;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then((ran) => console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'No pending migrations.'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
