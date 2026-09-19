const crypto = require('crypto');
const { db, getSetting, setSetting } = require('./db');

// ==========================================================
// ADMIN AUTHENTICATION
// ==========================================================
// The store PC is trusted: requests arriving directly on the loopback interface
// skip the password, so the desktop app and `npm run serve` behave as before.
// Anything reaching the app through a proxy (Render, a tunnel, a LAN address)
// must present the admin password. Set SIGMA_REQUIRE_PASSWORD=1 to force the
// password even locally.
// ==========================================================

const SESSION_COOKIE = 'sigma_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function randomPassword() {
  // Avoids look-alike characters so it can be read off a screen and typed
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(10))
    .map(b => alphabet[b % alphabet.length])
    .join('');
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), useSalt, 64).toString('hex');
  return `${useSalt}:${derived}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, expected] = String(stored).split(':');
    if (!salt || !expected) return false;
    const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
    // Constant-time compare so the response time does not leak the password
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) {
    return false;
  }
}

// Secret used to sign session cookies. Regenerated only if missing, so restarting
// the server does not log everyone out.
function getSessionSecret() {
  let secret = getSetting('admin_session_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting('admin_session_secret', secret);
  }
  return secret;
}

function initAdminPassword() {
  // An explicit env var always wins and is never written to the database
  if (process.env.ADMIN_PASSWORD) {
    return null;
  }

  if (getSetting('admin_password_hash')) {
    return null;
  }

  const generated = randomPassword();
  setSetting('admin_password_hash', hashPassword(generated));
  return generated;
}

function checkPassword(password) {
  if (!password) return false;

  if (process.env.ADMIN_PASSWORD) {
    const a = Buffer.from(String(password));
    const b = Buffer.from(String(process.env.ADMIN_PASSWORD));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  const stored = getSetting('admin_password_hash');
  if (!stored) return false;
  return verifyPassword(password, stored);
}

function setPassword(newPassword) {
  if (!newPassword || String(newPassword).length < 6) {
    throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  }
  setSetting('admin_password_hash', hashPassword(newPassword));
  // Invalidating the secret signs every existing session out
  setSetting('admin_session_secret', crypto.randomBytes(32).toString('hex'));
}

function issueSession() {
  const expires = Date.now() + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${expires}.${nonce}`;
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function isValidSession(token) {
  if (!token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;

  const [expires, nonce, sig] = parts;
  const payload = `${expires}.${nonce}`;
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return false;
    }
  } catch (_) {
    return false;
  }

  return Number(expires) > Date.now();
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

// A request counts as local only when it did NOT pass through a proxy. Render and
// tunnels always add x-forwarded-for, so a remote visitor can never look local.
function isLocalRequest(req) {
  if (process.env.SIGMA_REQUIRE_PASSWORD === '1') return false;
  if (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['forwarded']) return false;

  const ip = (req.socket && req.socket.remoteAddress) || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function isAuthenticated(req) {
  if (isLocalRequest(req)) return true;
  return isValidSession(parseCookies(req)[SESSION_COOKIE]);
}

function requireAdmin(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({
    success: false,
    authRequired: true,
    message: 'يلزم تسجيل الدخول للوصول إلى لوحة الإدارة'
  });
}

function sessionCookieHeader(token, secure) {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

function clearCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  SESSION_COOKIE,
  initAdminPassword,
  checkPassword,
  setPassword,
  issueSession,
  isAuthenticated,
  isLocalRequest,
  requireAdmin,
  sessionCookieHeader,
  clearCookieHeader
};
