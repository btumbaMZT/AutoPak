const { ensureAuthSchema, getSessionUser } = require('../../lib/auth');
const { isConfigured } = require('../../lib/microsoft');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }
    await ensureAuthSchema();
    const user = await getSessionUser(req);
    if (!user) {
      // configured=false lets the sign-in page say why the button won't work
      // yet, rather than sending people into a broken redirect.
      res.status(200).json({ authenticated: false, configured: isConfigured() });
      return;
    }
    res.status(200).json({
      authenticated: true,
      configured: isConfigured(),
      email: user.email,
      name: user.name,
      status: user.status,
      admin: user.is_admin,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
