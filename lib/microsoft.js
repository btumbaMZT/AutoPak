// Microsoft Entra ID (Azure AD) sign-in via the OAuth 2.0 authorization code
// flow. No SDK — Node's built-in fetch and crypto cover everything.

const ALLOWED_EMAIL_DOMAIN = 'mazzetti.com';
const SCOPES = 'openid profile email';

const clientId = () => process.env.MS_CLIENT_ID;
const clientSecret = () => process.env.MS_CLIENT_SECRET;
const tenantId = () => process.env.MS_TENANT_ID;

// Everything is inert until all three are set, so the branch can ship and sit
// dormant until IT provides the app registration.
function isConfigured() {
  return !!(clientId() && clientSecret() && tenantId());
}

// The redirect URI has to match one registered in Azure exactly. Derived from
// the request host so production and the preview alias both work — every host
// in use must be registered there or Microsoft rejects the request outright.
function redirectUri(req) {
  if (process.env.SITE_URL) return `${process.env.SITE_URL.replace(/\/$/, '')}/api/auth/callback`;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/auth/callback`;
}

function authorizeUrl(req, state, nonce) {
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    redirect_uri: redirectUri(req),
    response_mode: 'query',
    scope: SCOPES,
    state,
    nonce,
  });
  // Tenant-specific endpoint: the first of two tenant checks. The id_token's
  // tid claim is verified too — an endpoint alone isn't a control.
  return `https://login.microsoftonline.com/${tenantId()}/oauth2/v2.0/authorize?${params}`;
}

async function exchangeCode(req, code) {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(req),
    scope: SCOPES,
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${data.error_description || data.error || res.status}`);
  }
  return data;
}

function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length < 2) throw new Error('Malformed id_token');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

// The signature is not checked against Microsoft's JWKS, and that is
// deliberate rather than an oversight: this id_token arrives over a direct
// server-to-server TLS POST to Microsoft's token endpoint, never through the
// browser, which OIDC Core §3.1.3.7 explicitly allows. The claims below are
// still validated. If this app ever accepts a token via the front channel,
// full JWKS signature verification becomes mandatory.
function validateIdToken(idToken, expectedNonce) {
  const c = decodeJwtPayload(idToken);

  if (c.aud !== clientId()) throw new Error('id_token audience mismatch');
  if (c.tid !== tenantId()) throw new Error('Account is outside the Mazzetti directory');
  if (!String(c.iss || '').includes(tenantId())) throw new Error('id_token issuer mismatch');
  if (typeof c.exp === 'number' && c.exp * 1000 < Date.now()) throw new Error('id_token expired');
  if (expectedNonce && c.nonce !== expectedNonce) throw new Error('id_token nonce mismatch');

  const email = String(c.email || c.preferred_username || c.upn || '').trim().toLowerCase();
  if (!email) throw new Error('Microsoft did not return an email address');
  // Tenant membership isn't the same as employment — external guests can sit
  // in the directory with their own domains, so require the Mazzetti domain.
  if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new Error(`Sign in with your @${ALLOWED_EMAIL_DOMAIN} account`);
  }

  return { email, name: (c.name || '').trim() || null, oid: c.oid || null };
}

module.exports = {
  isConfigured, redirectUri, authorizeUrl, exchangeCode, validateIdToken,
  ALLOWED_EMAIL_DOMAIN,
};
