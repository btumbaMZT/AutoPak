const { ensureAuthSchema, getSessionUser } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }
    await ensureAuthSchema();
    const user = await getSessionUser(req);
    if (!user) { res.status(200).json({ authenticated: false }); return; }
    res.status(200).json({
      authenticated: true,
      email: user.email,
      name: user.name,
      status: user.status,
      admin: user.is_admin,
      needsName: !user.name,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
