const { sql, ensureAuthSchema, hashToken, createSession, setSessionCookie } = require('../../lib/auth');

function page(body) {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AutoPak — Sign in</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafaf8;color:#141719;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.sheet{background:#fff;border:1px solid #e6e4df;border-radius:12px;padding:32px;max-width:400px;width:100%;text-align:center}
h1{font-size:18px;margin-bottom:8px}
p{color:#7a7770;font-size:14px;line-height:1.5;margin-bottom:20px}
button,.btn{display:inline-block;background:#141719;color:#fff;border:none;text-decoration:none;
  padding:11px 22px;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
.err{color:#b3492b}
</style></head><body><div class="sheet">${body}</div></body></html>`;
}

module.exports = async function handler(req, res) {
  try {
    await ensureAuthSchema();

    if (req.method === 'GET') {
      const token = String(req.query && req.query.token || '');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (!token) { res.status(400).send(page('<h1>Missing link</h1><p>That link looks incomplete.</p>')); return; }

      const hash = hashToken(token);
      const rows = await sql`select u.email from magic_link_tokens t join users u on u.id = t.user_id
        where t.token_hash = ${hash} and t.consumed_at is null and t.expires_at > now()`;
      if (!rows[0]) {
        res.status(400).send(page('<h1>Link expired</h1><p>This sign-in link is invalid or has already been used. Go back to AutoPak and request a new one.</p>'));
        return;
      }

      res.status(200).send(page(`
        <h1>Confirm sign-in</h1>
        <p>Sign in to AutoPak as <b>${rows[0].email}</b>?</p>
        <button id="go">Confirm</button>
        <p id="msg" style="margin-top:16px"></p>
        <script>
          document.getElementById('go').onclick = async () => {
            const btn = document.getElementById('go'); btn.disabled = true; btn.textContent = 'Signing in…';
            try {
              const r = await fetch('/api/auth/verify', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token: ${JSON.stringify(token)}})});
              const d = await r.json();
              if (d.ok) { location.href = '/'; }
              else { document.getElementById('msg').innerHTML = '<span class="err">' + (d.error || 'Something went wrong.') + '</span>'; btn.disabled = false; btn.textContent = 'Confirm'; }
            } catch (e) { document.getElementById('msg').innerHTML = '<span class="err">Network error — try again.</span>'; btn.disabled = false; btn.textContent = 'Confirm'; }
          };
        </script>`));
      return;
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const token = String((body && body.token) || '');
      if (!token) { res.status(400).json({ ok: false, error: 'Missing token' }); return; }

      const hash = hashToken(token);
      const claimed = await sql`update magic_link_tokens set consumed_at = now()
        where token_hash = ${hash} and consumed_at is null and expires_at > now()
        returning user_id`;
      if (!claimed[0]) {
        res.status(400).json({ ok: false, error: 'This link is invalid, expired, or already used.' });
        return;
      }

      const userRows = await sql`update users set verified_at = coalesce(verified_at, now())
        where id = ${claimed[0].user_id} returning *`;
      const user = userRows[0];
      const raw = await createSession(user.id);
      setSessionCookie(res, raw);
      res.status(200).json({
        ok: true, status: user.status, admin: user.is_admin, needsName: !user.name,
      });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
