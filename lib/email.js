const SITE_URL = process.env.SITE_URL || 'https://autopak-vercel.vercel.app';

function verifyUrl(token) {
  return `${SITE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

function registrationEmail(token) {
  const url = verifyUrl(token);
  const subject = 'Confirm your AutoPak access request';
  const text = `Hi,

Someone (hopefully you) asked to register for AutoPak — the luminaire
cutsheet package tool. Confirm it's you:

  ${url}

This link expires in 15 minutes and can only be used once. If you
didn't request this, just ignore it — nothing happens until you click.

Once confirmed, an admin needs to approve your account before you can
open the dashboard. You'll see a "waiting on approval" screen until
that happens.

— AutoPak`;
  const html = `
<p>Hi,</p>
<p>Someone (hopefully you) asked to register for AutoPak — the luminaire cutsheet package tool. Confirm it's you:</p>
<p><a href="${url}" style="display:inline-block;background:#141719;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Confirm your email</a></p>
<p style="color:#7a7770;font-size:13px">Or paste this into your browser: <br>${url}</p>
<p>This link expires in 15 minutes and can only be used once. If you didn't request this, just ignore it — nothing happens until you click.</p>
<p>Once confirmed, an admin needs to approve your account before you can open the dashboard. You'll see a "waiting on approval" screen until that happens.</p>
<p>— AutoPak</p>`;
  return { subject, text, html };
}

function loginEmail(token) {
  const url = verifyUrl(token);
  const subject = 'Your AutoPak sign-in link';
  const text = `Hi,

Here's your sign-in link for AutoPak:

  ${url}

Expires in 15 minutes, one-time use. If you didn't request this, ignore it.

— AutoPak`;
  const html = `
<p>Hi,</p>
<p>Here's your sign-in link for AutoPak:</p>
<p><a href="${url}" style="display:inline-block;background:#141719;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Sign in</a></p>
<p style="color:#7a7770;font-size:13px">Or paste this into your browser: <br>${url}</p>
<p>Expires in 15 minutes, one-time use. If you didn't request this, ignore it.</p>
<p>— AutoPak</p>`;
  return { subject, text, html };
}

// Sends through the mailbox that completed the one-time device-code
// consent (see api/setup/ms-auth.js), via delegated Microsoft Graph
// Mail.Send — not a dedicated service account, so mail shows up as coming
// from that person's own address.
async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.MS_CLIENT_ID,
    scope: 'https://graph.microsoft.com/Mail.Send offline_access',
    refresh_token: process.env.MS_REFRESH_TOKEN,
  });
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Microsoft token refresh failed: ' + (data.error_description || data.error || res.status));
  return data.access_token;
}

async function sendAuthEmail(user, token) {
  const isNewRegistrant = !user.verified_at;
  const { subject, text, html } = isNewRegistrant ? registrationEmail(token) : loginEmail(token);
  const accessToken = await getAccessToken();
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: user.email } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Graph sendMail failed: ${res.status} ${errText}`);
  }
}

module.exports = { sendAuthEmail };
