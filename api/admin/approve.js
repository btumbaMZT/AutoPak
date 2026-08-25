const { sql, ensureAuthSchema, requireAdmin } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }
    await ensureAuthSchema();
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const userId = body && body.userId;
    if (!userId) { res.status(400).json({ ok: false, error: 'Missing userId' }); return; }

    const rows = await sql`update users set status = 'approved', approved_at = now(), approved_by = ${admin.email}
      where id = ${userId} returning id`;
    if (!rows[0]) { res.status(404).json({ ok: false, error: 'User not found' }); return; }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
