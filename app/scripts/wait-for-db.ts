import { Client } from 'pg';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://fazendados:fazendados@localhost:5432/fazendados';
const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT_MS ?? 30_000);
const retryMs = 1_000;
const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('select 1');
    await client.end();
    console.log('PostgreSQL está pronto.');
    process.exit(0);
  } catch {
    await client.end().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
}

console.error(`PostgreSQL não ficou pronto em ${timeoutMs} ms.`);
process.exit(1);
