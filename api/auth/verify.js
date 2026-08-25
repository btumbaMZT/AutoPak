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
.tip{font-size:13px;background:#fafaf8;border:1px solid #e6e4df;border-radius:8px;
  padding:12px 14px;margin:20px 0 0;text-align:left}
.tip b{color:#141719}
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
      const rows = await sql`select email from users where login_token_hash = ${hash}`;
      if (!rows[0]) {
        res.status(400).send(page('<h1>Link not valid</h1><p>This sign-in link isn’t recognised — it may have been replaced by a newer one. Ask an admin for your current link.</p>'));
        return;
      }

      res.status(200).send(page(`
        <h1>Confirm sign-in</h1>
        <p>Sign in to AutoPak as <b>${rows[0].email}</b>?</p>
        <button id="go">Confirm</button>
        <p class="tip"><b>Bookmark this page.</b> It’s your permanent sign-in link —
        use it any time you need to sign in again, on this or any other computer.</p>
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

      // Reusable on purpose — the token is not consumed, so the same link
      // works every time the user needs to sign in again.
      const hash = hashToken(token);
      const userRows = await sql`update users set verified_at = coalesce(verified_at, now())
        where login_token_hash = ${hash} returning *`;
      if (!userRows[0]) {
        res.status(400).json({ ok: false, error: 'This link isn’t recognised — it may have been replaced by a newer one.' });
        return;
      }
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
