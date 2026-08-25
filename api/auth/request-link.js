const { sql, ensureAuthSchema, newToken, hashToken, TOKEN_MINUTES } = require('../../lib/auth');
const { sendAuthEmail } = require('../../lib/email');

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

    const rows = await sql`insert into users (email) values (${email})
      on conflict (email) do update set email = excluded.email
      returning *`;
    const user = rows[0];

    if (user.status !== 'rejected') {
      const raw = newToken();
      const hash = hashToken(raw);
      const minutes = `${TOKEN_MINUTES} minutes`;
      await sql`insert into magic_link_tokens (user_id, token_hash, expires_at)
        values (${user.id}, ${hash}, now() + ${minutes}::interval)`;
      await sendAuthEmail(user, raw);
    }

    // Always a generic response — never reveal account status pre-verification.
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
