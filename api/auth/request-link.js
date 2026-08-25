const { sql, ensureAuthSchema } = require('../../lib/auth');

// No automated email exists in this app. This just records the request so
// it shows up in the Admin panel — an admin generates and hand-delivers
// the actual sign-in link (see api/admin/invite.js).
module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }
    await ensureAuthSchema();

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const email = String((body && body.email) || '').trim().toLowerCase();
    if (!/^[^\s@]+@mazzetti\.com$/.test(email)) {
      res.status(400).json({ ok: false, error: 'Use your @mazzetti.com email address' });
      return;
    }

    await sql`insert into users (email) values (${email})
      on conflict (email) do nothing`;

    // Always a generic response — never reveal account status.
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
