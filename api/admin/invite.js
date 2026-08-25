const { sql, ensureAuthSchema, requireAdmin, newToken, hashToken, verifyUrl, INVITE_TOKEN_MINUTES } = require('../../lib/auth');

// Approves an email (whether or not they'd already requested access) and
// returns a sign-in link for the admin to deliver by hand. There is no
// automated email in this app — the admin pastes this into Outlook/Teams.
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
    const email = String((body && body.email) || '').trim().toLowerCase();
    if (!/^[^\s@]+@mazzetti\.com$/.test(email)) {
      res.status(400).json({ ok: false, error: 'Use an @mazzetti.com email address' });
      return;
    }

    const rows = await sql`insert into users (email, status, verified_at, approved_at, approved_by)
      values (${email}, 'approved', now(), now(), ${admin.email})
      on conflict (email) do update set
        status = 'approved',
        verified_at = coalesce(users.verified_at, now()),
        approved_at = now(),
        approved_by = ${admin.email},
        rejected_at = null,
        rejected_by = null
      returning id, email`;
    const user = rows[0];

    const raw = newToken();
    const minutes = `${INVITE_TOKEN_MINUTES} minutes`;
    await sql`insert into magic_link_tokens (user_id, token_hash, expires_at)
      values (${user.id}, ${hashToken(raw)}, now() + ${minutes}::interval)`;

    res.status(200).json({ ok: true, email: user.email, link: verifyUrl(raw) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
