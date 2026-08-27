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

    const rows = await sql`select id, email, name, status, is_admin, last_login_at, created_at
      from users order by (last_login_at is null), last_login_at desc, email asc`;
    res.status(200).json({
      ok: true,
      users: rows.map((r) => ({
        id: r.id, email: r.email, name: r.name, status: r.status,
        isAdmin: r.is_admin, lastLoginAt: r.last_login_at, createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
