import pg from 'pg';

const farmId = process.argv[2];
if (!farmId) throw new Error('farmId is required');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query<{
    id: string;
    status: string;
    fields: Array<{ key: string; value: string }>;
    created_at: string;
  }>(`
    select p.id, p.status, p.fields, c.created_at
    from assistant_proposals p
    join assistant_captures c on c.id = p.capture_id
    where c.farm_id = $1
      and p.kind = 'controle_leiteiro'
      and p.status = 'pendente'
    order by c.created_at desc
    limit 5
  `, [farmId]);

  const safe = result.rows.map((proposal) => {
    const field = (key: string) => proposal.fields.find((candidate) => candidate.key === key)?.value ?? null;
    const rows = field('rows');
    return {
      id: proposal.id,
      status: proposal.status,
      createdAt: proposal.created_at,
      date: field('date'),
      group: field('group'),
      shift: field('shift'),
      rowFieldPresent: rows !== null,
      rowSegments: rows ? rows.split('·').filter((part) => part.trim()).length : 0,
    };
  });
  console.log(JSON.stringify(safe, null, 2));
} finally {
  await pool.end();
}
