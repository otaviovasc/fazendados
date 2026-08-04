import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL não foi configurada.');
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;

/** Transação: mesmo tipo que `getDb()` para os handlers de comando. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function closeDb() {
  await pool?.end();
  pool = undefined;
}
