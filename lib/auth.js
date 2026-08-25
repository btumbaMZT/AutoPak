const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

const SESSION_COOKIE = 'ap_session';
// Sessions never expire on their own. Every sign-in link is handed out by an
// admin by hand, so an expiring session would just mean re-sending links for
// no security gain: access is revoked by status, not by expiry. getSessionUser
// re-reads users.status on every request, so rejecting someone in the Admin
// panel locks them out on their next click even with a live cookie.
const TOKEN_MINUTES = 15;
const INVITE_TOKEN_MINUTES = 60 * 24 * 7; // 7 days — an admin may not send it right away
const SEED_ADMIN_EMAIL = 'btumba@mazzetti.com';
const SITE_URL = process.env.SITE_URL || 'https://autopak-vercel.vercel.app';

function verifyUrl(token) {
  return `${SITE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

async function ensureAuthSchema() {
  await sql`create table if not exists users (
    id bigserial primary key,
    email text not null unique,
    name text,
    status text not null default 'pending' check (status in ('pending','approved','rejected')),
    is_admin boolean not null default false,
    created_at timestamptz not null default now(),
    verified_at timestamptz,
    approved_at timestamptz,
    approved_by text,
    rejected_at timestamptz,
    rejected_by text
  )`;
  await sql`create table if not exists magic_link_tokens (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    token_hash text not null unique,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    consumed_at timestamptz
  )`;
  await sql`create table if not exists sessions (
    token_hash text primary key,
    user_id bigint not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz
  )`;
  // Sessions used to expire; now a null expires_at means "never". Drop the
  // old NOT NULL so new rows can be null, and clear existing expiries so
  // nobody already signed in gets kicked out by a stale deadline.
  await sql`alter table sessions alter column expires_at drop not null`;
  await sql`update sessions set expires_at = null where expires_at is not null`;
  await sql`insert into users (email, status, is_admin, verified_at, approved_at, approved_by)
    values (${SEED_ADMIN_EMAIL}, 'approved', true, now(), now(), 'system')
    on conflict (email) do nothing`;
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setSessionCookie(res, rawToken) {
  // 10 years — browsers cap cookie lifetimes, so this is the practical
  // stand-in for "no expiry" on the client side. The session row itself
  // has no expiry at all.
  const maxAge = 10 * 365 * 24 * 60 * 60;
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${rawToken}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

async function createSession(userId) {
  const raw = newToken();
  const hash = hashToken(raw);
  await sql`insert into sessions (token_hash, user_id, expires_at)
    values (${hash}, ${userId}, null)`;
  return raw;
}

async function getSessionUser(req) {
  const cookies = parseCookies(req);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const hash = hashToken(raw);
  const rows = await sql`select u.* from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hash} and (s.expires_at is null or s.expires_at > now())`;
  if (!rows[0]) return null;
  return rows[0];
}

async function destroySession(req) {
  const cookies = parseCookies(req);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return;
  await sql`delete from sessions where token_hash = ${hashToken(raw)}`;
}

async function requireSession(req, res) {
  const user = await getSessionUser(req);
  if (!user) { res.status(401).json({ ok: false, error: 'Not signed in' }); return null; }
  return user;
}
async function requireApproved(req, res) {
  const user = await requireSession(req, res);
  if (!user) return null;
  if (user.status !== 'approved') {
    res.status(403).json({ ok: false, error: 'Account not approved' });
    return null;
  }
  return user;
}
async function requireAdmin(req, res) {
  const user = await requireApproved(req, res);
  if (!user) return null;
  if (!user.is_admin) { res.status(403).json({ ok: false, error: 'Admin only' }); return null; }
  return user;
}

module.exports = {
  sql, ensureAuthSchema, newToken, hashToken, setSessionCookie, clearSessionCookie,
  createSession, getSessionUser, destroySession, requireSession, requireApproved, requireAdmin,
  verifyUrl, TOKEN_MINUTES, INVITE_TOKEN_MINUTES, SESSION_COOKIE,
};
