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
    const makeAdmin = !!(body && body.admin);
    if (!userId) { res.status(400).json({ ok: false, error: 'Missing userId' }); return; }

    if (!makeAdmin) {
      const countRows = await sql`select count(*)::int as n from users where is_admin and status = 'approved'`;
      const isTargetAdmin = await sql`select is_admin from users where id = ${userId}`;
      if (isTargetAdmin[0] && isTargetAdmin[0].is_admin && countRows[0].n <= 1) {
        res.status(400).json({ ok: false, error: 'Cannot remove the last admin' });
        return;
      }
    }

    const rows = await sql`update users set is_admin = ${makeAdmin} where id = ${userId} and status = 'approved' returning id`;
    if (!rows[0]) { res.status(404).json({ ok: false, error: 'User not found' }); return; }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
