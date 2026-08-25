const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function ensureSchema() {
  await sql`create table if not exists registry (
    id smallint primary key default 1 check (id = 1),
    doc jsonb not null default '{"version":1,"projects":[],"issuances":[]}'::jsonb,
    updated_at timestamptz not null default now(),
    updated_by text
  )`;
  await sql`insert into registry (id, doc) values (1, '{"version":1,"projects":[],"issuances":[]}'::jsonb)
    on conflict (id) do nothing`;
}

module.exports = async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`select doc, updated_at from registry where id = 1`;
      const row = rows[0];
      const doc = (row && row.doc) || { version: 1, projects: [], issuances: [] };
      res.status(200).json({
        version: doc.version || 1,
        projects: doc.projects || [],
        issuances: doc.issuances || [],
        updatedAt: row && row.updated_at,
      });
      return;
    }

    if (req.method === 'PUT') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { doc, expectedUpdatedAt, updatedBy } = body || {};
      if (!doc || !Array.isArray(doc.projects) || !Array.isArray(doc.issuances)) {
        res.status(400).json({ ok: false, error: 'Malformed registry document' });
        return;
      }
      const docJson = JSON.stringify(doc);
      const rows = await sql`update registry set doc = ${docJson}::jsonb, updated_at = now(), updated_by = ${updatedBy || null}
        where id = 1 and updated_at = ${expectedUpdatedAt || null} returning updated_at`;

      if (rows.length === 0) {
        const cur = await sql`select updated_at from registry where id = 1`;
        res.status(409).json({ ok: false, error: 'conflict', currentUpdatedAt: cur[0] && cur[0].updated_at });
        return;
      }
      res.status(200).json({ ok: true, updatedAt: rows[0].updated_at });
      return;
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
