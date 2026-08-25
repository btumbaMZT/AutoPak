// ONE-TIME BOOTSTRAP ENDPOINT. Delete this file immediately after use — it
// exists only to obtain the initial Microsoft refresh token via the OAuth
// device-code flow, and displays that token in plain HTTP once it's granted.
// Requires MS_CLIENT_ID and MS_TENANT_ID to already be set as env vars
// (from the Azure App Registration — see the AutoPak plan doc).

const SCOPE = 'https://graph.microsoft.com/Mail.Send offline_access';

function page(body) {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AutoPak — Microsoft mail setup</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafaf8;color:#141719;
  max-width:560px;margin:48px auto;padding:0 20px;line-height:1.6}
.code{font-family:ui-monospace,monospace;font-size:28px;letter-spacing:4px;background:#fff;border:1px solid #e6e4df;
  border-radius:8px;padding:16px 20px;display:inline-block;margin:12px 0}
.btn{display:inline-block;background:#141719;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600}
textarea{width:100%;font-family:ui-monospace,monospace;font-size:12px;padding:10px;border:1px solid #e6e4df;border-radius:6px}
.err{color:#b3492b}
</style></head><body>${body}</body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const clientId = process.env.MS_CLIENT_ID;
  const tenantId = process.env.MS_TENANT_ID;
  if (!clientId || !tenantId) {
    res.status(500).send(page('<h1>Missing config</h1><p>Set MS_CLIENT_ID and MS_TENANT_ID env vars first.</p>'));
    return;
  }

  const step = (req.query && req.query.step) || 'start';

  try {
    if (step === 'start') {
      const r = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, scope: SCOPE }),
      });
      const d = await r.json();
      if (!r.ok) { res.status(400).send(page(`<h1 class="err">Error</h1><pre>${JSON.stringify(d, null, 2)}</pre>`)); return; }

      const pollUrl = `/api/setup/ms-auth?step=poll&device_code=${encodeURIComponent(d.device_code)}`;
      res.status(200).send(page(`
        <h1>Sign in to authorize AutoPak</h1>
        <p>1. Go to <a href="${d.verification_uri}" target="_blank">${d.verification_uri}</a> and sign in as yourself.</p>
        <p>2. Enter this code:</p>
        <div class="code">${d.user_code}</div>
        <p>3. Approve the "AutoPak Mailer" app when prompted (it's asking to send mail as you).</p>
        <p>4. Then come back and click below.</p>
        <p><a class="btn" href="${pollUrl}">I've signed in — check now</a></p>`));
      return;
    }

    if (step === 'poll') {
      const deviceCode = req.query.device_code;
      const r = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: clientId,
          device_code: deviceCode,
        }),
      });
      const d = await r.json();

      if (!r.ok) {
        if (d.error === 'authorization_pending' || d.error === 'slow_down') {
          const retryUrl = `/api/setup/ms-auth?step=poll&device_code=${encodeURIComponent(deviceCode)}`;
          res.status(200).send(page(`
            <h1>Waiting…</h1>
            <p>Haven't completed sign-in yet, or it hasn't propagated. Wait a few seconds and try again.</p>
            <p><a class="btn" href="${retryUrl}">Check again</a></p>`));
          return;
        }
        res.status(400).send(page(`<h1 class="err">Error</h1><pre>${JSON.stringify(d, null, 2)}</pre><p>Start over from <a href="/api/setup/ms-auth">/api/setup/ms-auth</a>.</p>`));
        return;
      }

      res.status(200).send(page(`
        <h1>Done — copy this now</h1>
        <p>Set these as Vercel env vars (Production + Preview), then delete <code>api/setup/ms-auth.js</code>:</p>
        <p><b>MS_CLIENT_ID</b></p><textarea rows="1" readonly>${clientId}</textarea>
        <p><b>MS_TENANT_ID</b></p><textarea rows="1" readonly>${tenantId}</textarea>
        <p><b>MS_REFRESH_TOKEN</b></p><textarea rows="6" readonly>${d.refresh_token}</textarea>
        <p style="color:#b3492b">This refresh token will not be shown again. Copy it now.</p>`));
      return;
    }

    res.status(400).send(page('<h1 class="err">Unknown step</h1>'));
  } catch (err) {
    console.error(err);
    res.status(500).send(page(`<h1 class="err">Server error</h1><pre>${String(err)}</pre>`));
  }
};
