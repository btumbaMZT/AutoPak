const { sql, ensureAuthSchema, requireSession } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }
    await ensureAuthSchema();
    const user = await requireSession(req, res);
    if (!user) return;

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const name = String((body && body.name) || '').trim().slice(0, 100);
    if (!name) { res.status(400).json({ ok: false, error: 'Name is required' }); return; }

    await sql`update users set name = ${name} where id = ${user.id}`;
    res.status(200).json({ ok: true, name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
