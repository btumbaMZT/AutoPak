const {
  sql, ensureAuthSchema, parseCookies, createSession, setSessionCookie, isSecure, SEED_ADMIN_EMAIL,
} = require('../../lib/auth');
const { isConfigured, exchangeCode, validateIdToken } = require('../../lib/microsoft');

function errorPage(message) {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AutoPak — Sign-in problem</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafaf8;color:#141719;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.sheet{background:#fff;border:1px solid #e6e4df;border-radius:12px;padding:32px;max-width:420px;width:100%;text-align:center}
h1{font-size:18px;margin-bottom:10px}
p{color:#7a7770;font-size:14px;line-height:1.55;margin-bottom:22px}
a{display:inline-block;background:#141719;color:#fff;text-decoration:none;
  padding:11px 22px;border-radius:6px;font-weight:600;font-size:14px}
</style></head><body><div class="sheet">
<h1>Couldn’t sign you in</h1><p>${message}</p><a href="/">Back to AutoPak</a>
</div></body></html>`;
}

module.exports = async function handler(req, res) {
  const fail = (msg, code) => {
    res.status(code || 400).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(errorPage(msg));
  };

  try {
    if (!isConfigured()) {
      fail('Microsoft sign-in isn’t configured on this deployment yet.', 503);
      return;
    }

    // Microsoft reports its own failures (consent declined, etc.) here.
    if (req.query && req.query.error) {
      fail(String(req.query.error_description || req.query.error), 400);
      return;
    }

    const code = req.query && req.query.code;
    const state = req.query && req.query.state;
    if (!code || !state) { fail('That sign-in link was incomplete. Please try again.'); return; }

    const cookies = parseCookies(req);
    if (!cookies.ap_oauth_state || cookies.ap_oauth_state !== state) {
      fail('This sign-in attempt has expired or didn’t start here. Please try again.');
      return;
    }

    const tokens = await exchangeCode(req, code);
    // Throws on audience/tenant/issuer/expiry/nonce mismatch, or a non-Mazzetti address.
    const profile = validateIdToken(tokens.id_token, cookies.ap_oauth_nonce);

    await ensureAuthSchema();

    // Matched on email, which is what the seeded admin row is keyed by. The
    // Microsoft object id is recorded alongside it as the stable identifier,
    // and the name is refreshed from the directory on every sign-in.
    const rows = await sql`insert into users (email, ms_oid, name, last_login_at)
      values (${profile.email}, ${profile.oid}, ${profile.name}, now())
      on conflict (email) do update set
        ms_oid = coalesce(excluded.ms_oid, users.ms_oid),
        name = coalesce(excluded.name, users.name),
        last_login_at = now()
      returning *`;
    let user = rows[0];

    // Safety net for the seeded admin: if the row was created by some other
    // path without the flag, restore it rather than leaving nobody able to
    // administer the app.
    if (!user.is_admin && user.email === SEED_ADMIN_EMAIL) {
      const promoted = await sql`update users set is_admin = true where id = ${user.id} returning *`;
      user = promoted[0];
    }

    const raw = await createSession(user.id);
    setSessionCookie(res, raw);
    // setSessionCookie owns the Set-Cookie header, so clear the one-shot
    // OAuth cookies in the same response by appending to it.
    const secure = isSecure() ? '; Secure' : '';
    const expired = `HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
    const existing = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [].concat(existing || [], [
      `ap_oauth_state=; ${expired}`,
      `ap_oauth_nonce=; ${expired}`,
    ]));

    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    console.error(err);
    fail(err && err.message ? err.message : 'Something went wrong signing you in.');
  }
};
