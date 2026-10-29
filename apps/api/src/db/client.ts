import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(url: string, max = 10) {
  const client = postgres(url, { max, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/**
 * Runs `fn` in a transaction scoped to one institution. The scope is transaction-local
 * (set_config(..., true)), so it can never leak to the next request on a pooled connection.
 * Every institutional query in the API must go through this function.
 */
export async function withInstitution<T>(
  db: Db,
  institutionId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.institution_id', ${institutionId}, true)`);
    return fn(tx);
  });
}

export async function resolveInstitutionId(db: Db, key: string): Promise<string | null> {
  const rows = await db.execute<{ id: string | null }>(sql`select resolve_institution_id(${key}) as id`);
  return rows[0]?.id ?? null;
}
