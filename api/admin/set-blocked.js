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
    const blocked = !!(body && body.blocked);
    if (!userId) { res.status(400).json({ ok: false, error: 'Missing userId' }); return; }
    if (String(userId) === String(admin.id) && blocked) {
      res.status(400).json({ ok: false, error: 'You can’t block yourself' });
      return;
    }

    if (blocked) {
      const count = await sql`select count(*)::int as n from users where is_admin and status = 'active'`;
      const target = await sql`select is_admin from users where id = ${userId}`;
      if (target[0] && target[0].is_admin && count[0].n <= 1) {
        res.status(400).json({ ok: false, error: 'Cannot block the last admin' });
        return;
      }
    }

    const rows = await sql`update users set
      status = ${blocked ? 'blocked' : 'active'},
      blocked_at = ${blocked ? new Date().toISOString() : null},
      blocked_by = ${blocked ? admin.email : null}
      where id = ${userId} returning id`;
    if (!rows[0]) { res.status(404).json({ ok: false, error: 'User not found' }); return; }

    // Existing sessions aren't deleted: getSessionUser re-reads users.status
    // on every request, so a blocked person is stopped on their next action.
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
