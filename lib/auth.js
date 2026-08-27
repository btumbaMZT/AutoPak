const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

const SESSION_COOKIE = 'ap_session';
const SEED_ADMIN_EMAIL = 'btumba@mazzetti.com';

async function ensureAuthSchema() {
  // Identity comes from Microsoft (Entra ID), so there's nothing to verify or
  // approve here: signing in with a Mazzetti account is itself the proof.
  // A row is created on first sign-in and is 'active' straight away.
  await sql`create table if not exists users (
    id bigserial primary key,
    email text not null unique,
    ms_oid text unique,
    name text,
    status text not null default 'active' check (status in ('active','blocked')),
    is_admin boolean not null default false,
    created_at timestamptz not null default now(),
    last_login_at timestamptz,
    blocked_at timestamptz,
    blocked_by text
  )`;
  // Sessions never expire. Access is revoked via users.status, which
  // getSessionUser re-reads on every request, so blocking someone takes
  // effect on their next action rather than whenever a token lapses.
  await sql`create table if not exists sessions (
    token_hash text primary key,
    user_id bigint not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz
  )`;
  // Pre-seeded so the first sign-in lands in the admin panel rather than
  // leaving nobody able to promote anyone.
  await sql`insert into users (email, is_admin) values (${SEED_ADMIN_EMAIL}, true)
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

const isSecure = () => !!process.env.VERCEL;

function setSessionCookie(res, rawToken) {
  // 10 years — browsers cap cookie lifetimes, so this is the practical
  // stand-in for "no expiry" on the client side. The session row itself
  // has no expiry at all.
  const maxAge = 10 * 365 * 24 * 60 * 60;
  const secure = isSecure() ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${rawToken}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

async function createSession(userId) {
  const raw = newToken();
  await sql`insert into sessions (token_hash, user_id, expires_at)
    values (${hashToken(raw)}, ${userId}, null)`;
  return raw;
}

async function getSessionUser(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return null;
  const rows = await sql`select u.* from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(raw)} and (s.expires_at is null or s.expires_at > now())`;
  return rows[0] || null;
}

async function destroySession(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return;
  await sql`delete from sessions where token_hash = ${hashToken(raw)}`;
}

async function requireSession(req, res) {
  const user = await getSessionUser(req);
  if (!user) { res.status(401).json({ ok: false, error: 'Not signed in' }); return null; }
  return user;
}
async function requireActive(req, res) {
  const user = await requireSession(req, res);
  if (!user) return null;
  if (user.status !== 'active') {
    res.status(403).json({ ok: false, error: 'Access blocked' });
    return null;
  }
  return user;
}
async function requireAdmin(req, res) {
  const user = await requireActive(req, res);
  if (!user) return null;
  if (!user.is_admin) { res.status(403).json({ ok: false, error: 'Admin only' }); return null; }
  return user;
}

module.exports = {
  sql, ensureAuthSchema, newToken, hashToken, parseCookies, isSecure,
  setSessionCookie, clearSessionCookie, createSession, getSessionUser, destroySession,
  requireSession, requireActive, requireAdmin, SESSION_COOKIE, SEED_ADMIN_EMAIL,
};
