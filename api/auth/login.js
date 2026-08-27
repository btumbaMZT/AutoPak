const { newToken, isSecure } = require('../../lib/auth');
const { isConfigured, authorizeUrl } = require('../../lib/microsoft');

module.exports = async function handler(req, res) {
  try {
    if (!isConfigured()) {
      res.status(503).json({
        ok: false,
        error: 'Microsoft sign-in isn’t configured yet — MS_CLIENT_ID, MS_TENANT_ID and MS_CLIENT_SECRET need to be set.',
      });
      return;
    }

    // state guards against CSRF on the callback; nonce binds the id_token to
    // this particular sign-in attempt. Both are short-lived HttpOnly cookies,
    // compared on return and cleared immediately after.
    const state = newToken();
    const nonce = newToken();
    const secure = isSecure() ? '; Secure' : '';
    const flags = `HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=600`;
    res.setHeader('Set-Cookie', [
      `ap_oauth_state=${state}; ${flags}`,
      `ap_oauth_nonce=${nonce}; ${flags}`,
    ]);

    res.writeHead(302, { Location: authorizeUrl(req, state, nonce) });
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
};
