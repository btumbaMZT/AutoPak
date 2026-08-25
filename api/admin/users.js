const { sql, ensureAuthSchema, requireAdmin } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }
    await ensureAuthSchema();
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const rows = await sql`select id, email, name, is_admin, approved_at from users
      where status = 'approved' order by email asc`;
    res.status(200).json({
      ok: true,
      users: rows.map((r) => ({ id: r.id, email: r.email, name: r.name, isAdmin: r.is_admin, approvedAt: r.approved_at })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
