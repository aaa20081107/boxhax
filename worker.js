// ============================================================
// BoxHax by Nova - Worker 核心（完整版 + 初始化端點）
// ============================================================

const LIMITS = {
  community:  { groups: 1,        members: 5,        domains: 1,        line: 1 },
  enterprise: { groups: Infinity, members: Infinity, domains: Infinity, line: Infinity }
};

function getLimits(edition) {
  return LIMITS[edition] || LIMITS.community;
}

// ---------- CORS ----------
const ALLOWED_ORIGINS = [
  'https://boxhax.pages.dev',
  'https://boxhax-dashboard.pages.dev'
];

function getCorsHeaders(request) {
  const origin = (request && request.headers.get('Origin')) || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

// ---------- 工具 ----------
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeDomain(input) {
  return String(input || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function json(data, status = 200, request = null) {
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (request) Object.assign(headers, getCorsHeaders(request));
  return new Response(JSON.stringify(data), { status, headers });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

function unauthorized(request) {
  return json({ error: 'unauthorized' }, 401, request);
}

// ---------- 可信時間 ----------
async function getTrustedNow() {
  try {
    const res = await fetch('https://cloudflare.com/cdn-cgi/trace');
    const text = await res.text();
    const line = text.split('\n').find(l => l.startsWith('ts='));
    if (line) {
      const ts = parseFloat(line.split('=')[1]) * 1000;
      if (Math.abs(ts - Date.now()) < 5 * 60 * 1000) return ts;
    }
  } catch (_) {}
  return Date.now();
}

// ---------- 序號驗證 ----------
async function verifyLicense(licenseKey, currentDomain, secretSalt) {
  if (!licenseKey) return { edition: 'community', valid: false };

  const m = licenseKey.match(/^BHX-(\d{8})-([A-Z0-9]{12})-([A-Z0-9]{4})$/);
  if (!m) return { edition: 'community', valid: false, reason: 'format' };

  const [, expiry, mainCode, checkCode] = m;

  const expectedCheck = (await sha256Hex(`${expiry}|${secretSalt}`))
    .slice(0, 4).toUpperCase();
  if (expectedCheck !== checkCode) {
    return { edition: 'community', valid: false, reason: 'check' };
  }

  const expectedMain = (await sha256Hex(`${currentDomain}|${expiry}|${secretSalt}`))
    .slice(0, 12).toUpperCase();
  if (expectedMain !== mainCode) {
    return { edition: 'community', valid: false, reason: 'domain' };
  }

  const y = +expiry.slice(0, 4);
  const mo = +expiry.slice(4, 6) - 1;
  const d = +expiry.slice(6, 8);
  const expiresAt = Date.UTC(y, mo, d, 23, 59, 59);

  const now = await getTrustedNow();
  if (now > expiresAt) {
    return { edition: 'community', valid: false, reason: 'expired', expiresAt };
  }

  return { edition: 'enterprise', valid: true, expiresAt };
}

// ---------- 登入驗證 ----------
function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const out = {};
  header.split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  });
  return out;
}

async function makeSessionToken(env) {
  const secret = env.SESSION_SECRET || env.SECRET_SALT || 'fallback-session-secret';
  const ts = Date.now();
  const hash = await sha256Hex(`session|${ts}|${secret}`);
  return `${ts}.${hash}`;
}

async function isValidSession(request, env) {
  const cookies = parseCookies(request);
  const token = cookies['boxhax_session'];
  if (!token) return false;

  const [tsStr, hash] = token.split('.');
  if (!tsStr || !hash) return false;

  const ts = parseInt(tsStr, 10);
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - ts > maxAge) return false;

  const secret = env.SESSION_SECRET || env.SECRET_SALT || 'fallback-session-secret';
  const expected = await sha256Hex(`session|${ts}|${secret}`);
  return expected === hash;
}

// ---------- 免費版硬鎖 ----------
async function checkGroupLimit(env, edition) {
  const limits = getLimits(edition);
  const { results } = await env.DB.prepare(`SELECT COUNT(*) AS c FROM groups`).all();
  return (results[0]?.c || 0) < limits.groups;
}

async function checkMemberLimit(env, groupId, edition) {
  const limits = getLimits(edition);
  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM members WHERE group_id = ?`
  ).bind(groupId).all();
  return (results[0]?.c || 0) < limits.members;
}

async function checkDomainLimit(env, edition) {
  const limits = getLimits(edition);
  const { results } = await env.DB.prepare(`SELECT COUNT(*) AS c FROM domains`).all();
  return (results[0]?.c || 0) < limits.domains;
}

async function checkLineLimit(env, edition) {
  const limits = getLimits(edition);
  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM line_bindings WHERE is_active = 1`
  ).all();
  return (results[0]?.c || 0) < limits.line;
}

// ---------- 稽核 ----------
async function logEvent(env, type, message, meta) {
  try {
    await env.DB.prepare(
      `INSERT INTO system_events (event_type, message, meta, created_at) VALUES (?, ?, ?, ?)`
    ).bind(type, message || null, meta ? JSON.stringify(meta) : null, Date.now()).run();
  } catch (_) {}
}

// ---------- 驗證碼解析 ----------
function extractCode(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/(驗證碼|verification|code|otp|pin)/i.test(line)) {
      const m = line.match(/\b(\d{4,6})\b/);
      if (m) return m[1];
    }
  }
  const m = text.match(/\b(\d{4,6})\b/);
  return m ? m[1] : null;
}

// ============================================================
// 初始化資料庫
// ============================================================
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS license (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key       TEXT,
    edition           TEXT NOT NULL DEFAULT 'community',
    bound_domain      TEXT,
    expires_at        INTEGER,
    activated_at      INTEGER,
    last_checked_at   INTEGER,
    is_valid          INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS groups (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    slug              TEXT UNIQUE,
    owner_member_id   INTEGER,
    max_members       INTEGER DEFAULT 5,
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id          INTEGER NOT NULL,
    display_name      TEXT NOT NULL,
    email             TEXT,
    role              TEXT NOT NULL DEFAULT 'member',
    status            TEXT NOT NULL DEFAULT 'active',
    line_user_id      TEXT,
    joined_at         INTEGER NOT NULL,
    last_seen_at      INTEGER,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_members_role ON members(group_id, role)`,
  `CREATE TABLE IF NOT EXISTS domains (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id          INTEGER NOT NULL,
    domain            TEXT NOT NULL,
    is_primary        INTEGER NOT NULL DEFAULT 0,
    verified          INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_unique ON domains(domain)`,
  `CREATE INDEX IF NOT EXISTS idx_domains_group ON domains(group_id)`,
  `CREATE TABLE IF NOT EXISTS line_bindings (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id          INTEGER,
    label             TEXT,
    line_group_id     TEXT NOT NULL,
    channel_token     TEXT,
    is_default        INTEGER NOT NULL DEFAULT 0,
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_line_group ON line_bindings(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_line_default ON line_bindings(is_default)`,
  `CREATE TABLE IF NOT EXISTS inboxes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id          INTEGER NOT NULL,
    address           TEXT NOT NULL,
    provider          TEXT,
    forward_token     TEXT UNIQUE,
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inboxes_group ON inboxes(group_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_inboxes_token ON inboxes(forward_token)`,
  `CREATE TABLE IF NOT EXISTS codes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id          INTEGER NOT NULL,
    inbox_id          INTEGER,
    code              TEXT NOT NULL,
    sender            TEXT,
    subject           TEXT,
    raw_snippet       TEXT,
    received_at       INTEGER NOT NULL,
    expires_at        INTEGER,
    is_used           INTEGER NOT NULL DEFAULT 0,
    pushed            INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_codes_group_time ON codes(group_id, received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_codes_code ON codes(code)`,
  `CREATE INDEX IF NOT EXISTS idx_codes_pushed ON codes(pushed)`,
  `CREATE TABLE IF NOT EXISTS push_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    code_id           INTEGER,
    binding_id        INTEGER,
    status            TEXT NOT NULL,
    response          TEXT,
    created_at        INTEGER NOT NULL,
    FOREIGN KEY (code_id) REFERENCES codes(id) ON DELETE CASCADE,
    FOREIGN KEY (binding_id) REFERENCES line_bindings(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_push_logs_code ON push_logs(code_id)`,
  `CREATE TABLE IF NOT EXISTS system_events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type        TEXT NOT NULL,
    message           TEXT,
    meta              TEXT,
    created_at        INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_type_time ON system_events(event_type, created_at DESC)`,
  `INSERT INTO license (edition, is_valid)
   SELECT 'community', 0
   WHERE NOT EXISTS (SELECT 1 FROM license)`
];

async function runInit(env) {
  const results = [];
  for (let i = 0; i < SCHEMA_STATEMENTS.length; i++) {
    try {
      await env.DB.prepare(SCHEMA_STATEMENTS[i]).run();
      results.push({ i, ok: true });
    } catch (e) {
      results.push({ i, ok: false, error: e.message });
    }
  }
  return results;
}

// ---------- 初始化頁面 ----------
function initPage(message, ok) {
  const color = ok ? '#2ecc71' : '#e74c3c';
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BoxHax — 初始化</title>
<style>
  body{margin:0;font-family:-apple-system,"Segoe UI","Noto Sans TC",sans-serif;
    background:#0f1115;color:#e6e8ee;display:flex;align-items:center;
    justify-content:center;min-height:100vh;padding:20px}
  .box{background:#171a21;border:1px solid #2a2f3a;border-radius:12px;
    padding:28px;width:100%;max-width:420px}
  h1{font-size:20px;margin:0 0 6px;text-align:center}
  .sub{font-size:13px;color:#8b93a7;text-align:center;margin-bottom:20px}
  label{display:block;font-size:13px;color:#8b93a7;margin-bottom:6px}
  input{width:100%;padding:10px 12px;background:#0c0e12;border:1px solid #2a2f3a;
    border-radius:8px;color:#e6e8ee;font-size:14px;outline:none;box-sizing:border-box}
  input:focus{border-color:#4f8cff}
  button{width:100%;padding:12px;background:#4f8cff;border:none;border-radius:8px;
    color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin-top:14px}
  button:hover{opacity:0.9}
  .msg{margin-top:14px;font-size:13px;color:${color};text-align:center}
</style>
</head>
<body>
<div class="box">
  <h1>BoxHax 初始化</h1>
  <div class="sub">第一次使用請先初始化資料庫</div>
  <form method="POST" action="/init">
    <label>初始化密碼（INIT_TOKEN）</label>
    <input type="password" name="token" placeholder="輸入你的 INIT_TOKEN" required />
    <button type="submit">一鍵初始化</button>
  </form>
  ${message ? `<div class="msg">${message}</div>` : ''}
</div>
</body>
</html>`;
}

// ============================================================
// 登入 API
// ============================================================
async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const { username, password } = body;

  const adminUser = env.ADMIN_USERNAME || 'admin';
  const adminPass = env.ADMIN_PASSWORD || '';

  if (!adminPass) {
    return json({ error: '系統未設定管理員密碼，請先設定 ADMIN_PASSWORD' }, 500, request);
  }

  if (username !== adminUser || password !== adminPass) {
    await logEvent(env, 'login_failed', username, null);
    return json({ error: '帳號或密碼錯誤' }, 401, request);
  }

  const token = await makeSessionToken(env);
  await logEvent(env, 'login_success', username, null);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': `boxhax_session=${token}; Path=/; Secure; SameSite=None; Max-Age=${7 * 24 * 60 * 60}`,
      ...getCorsHeaders(request)
    }
  });
}

async function handleLogout(request) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': `boxhax_session=; Path=/; Secure; SameSite=None; Max-Age=0`,
      ...getCorsHeaders(request)
    }
  });
}

async function handleMe(request, env) {
  const valid = await isValidSession(request, env);
  return json({ loggedIn: valid }, 200, request);
}

// ============================================================
// 版本 API
// ============================================================
async function handleLicense(request, env) {
  const url = new URL(request.url);
  const domain = normalizeDomain(url.hostname);
  const result = await verifyLicense(env.LICENSE_KEY, domain, env.SECRET_SALT);
  return json(result, 200, request);
}

// ============================================================
// 團隊 API
// ============================================================
async function handleGroupsList(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT g.*, (SELECT COUNT(*) FROM members m WHERE m.group_id = g.id) AS memberCount
     FROM groups g ORDER BY g.created_at DESC`
  ).all();
  return json({ groups: results || [] }, 200, request);
}

async function handleGroupsCreate(request, env) {
  const url = new URL(request.url);
  const domain = normalizeDomain(url.hostname);
  const lic = await verifyLicense(env.LICENSE_KEY, domain, env.SECRET_SALT);

  if (!(await checkGroupLimit(env, lic.edition))) {
    return json({ error: '已達版本團隊數量上限' }, 403, request);
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return json({ error: '缺少團隊名稱' }, 400, request);

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    || 'group-' + Date.now();
  const limits = getLimits(lic.edition);

  await env.DB.prepare(
    `INSERT INTO groups (name, slug, max_members, is_active, created_at)
     VALUES (?, ?, ?, 1, ?)`
  ).bind(name, slug, limits.members === Infinity ? 9999 : limits.members, Date.now()).run();

  await logEvent(env, 'group_created', name, null);
  return json({ ok: true }, 200, request);
}

async function handleGroupsDelete(request, env, id) {
  await env.DB.prepare(`DELETE FROM groups WHERE id = ?`).bind(id).run();
  await logEvent(env, 'group_deleted', String(id), null);
  return json({ ok: true }, 200, request);
}

async function handleGroupsUpdate(request, env, id) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return json({ error: '缺少團隊名稱' }, 400, request);

  await env.DB.prepare(
    `UPDATE groups SET name = ?, updated_at = ? WHERE id = ?`
  ).bind(name, Date.now(), id).run();

  return json({ ok: true }, 200, request);
}

// ============================================================
// 成員 API
// ============================================================
async function handleMembersList(request, env, groupId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM members WHERE group_id = ? ORDER BY joined_at DESC`
  ).bind(groupId).all();
  return json({ members: results || [] }, 200, request);
}

async function handleMembersCreate(request, env, groupId) {
  const url = new URL(request.url);
  const domain = normalizeDomain(url.hostname);
  const lic = await verifyLicense(env.LICENSE_KEY, domain, env.SECRET_SALT);

  if (!(await checkMemberLimit(env, groupId, lic.edition))) {
    return json({ error: '已達版本成員數量上限' }, 403, request);
  }

  const body = await request.json().catch(() => ({}));
  const display_name = String(body.display_name || '').trim();
  const role = String(body.role || 'member');
  if (!display_name) return json({ error: '缺少成員名稱' }, 400, request);

  await env.DB.prepare(
    `INSERT INTO members (group_id, display_name, email, role, status, joined_at)
     VALUES (?, ?, ?, ?, 'active', ?)`
  ).bind(groupId, display_name, body.email || null, role, Date.now()).run();

  return json({ ok: true }, 200, request);
}

async function handleMembersDelete(request, env, id) {
  await env.DB.prepare(`DELETE FROM members WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, request);
}

async function handleMembersUpdate(request, env, id) {
  const body = await request.json().catch(() => ({}));
  const role = String(body.role || 'member');
  await env.DB.prepare(`UPDATE members SET role = ? WHERE id = ?`).bind(role, id).run();
  return json({ ok: true }, 200, request);
}

// ============================================================
// 網域 API
// ============================================================
async function handleDomainsList(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM domains ORDER BY created_at DESC`
  ).all();
  return json({ domains: results || [] }, 200, request);
}

async function handleDomainsCreate(request, env) {
  const url = new URL(request.url);
  const domain = normalizeDomain(url.hostname);
  const lic = await verifyLicense(env.LICENSE_KEY, domain, env.SECRET_SALT);

  if (!(await checkDomainLimit(env, lic.edition))) {
    return json({ error: '已達版本網域數量上限' }, 403, request);
  }

  const body = await request.json().catch(() => ({}));
  const newDomain = normalizeDomain(body.domain);
  const groupId = body.group_id;
  if (!newDomain || !groupId) return json({ error: '缺少網域或團隊 ID' }, 400, request);

  await env.DB.prepare(
    `INSERT INTO domains (group_id, domain, is_primary, verified, created_at)
     VALUES (?, ?, 0, 0, ?)`
  ).bind(groupId, newDomain, Date.now()).run();

  return json({ ok: true }, 200, request);
}

async function handleDomainsDelete(request, env, id) {
  await env.DB.prepare(`DELETE FROM domains WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, request);
}

// ============================================================
// 驗證碼 API
// ============================================================
async function handleCodesList(request, env) {
  const url = new URL(request.url);
  const groupId = url.searchParams.get('group_id');
  const sql = groupId
    ? `SELECT * FROM codes WHERE group_id = ? ORDER BY received_at DESC LIMIT 100`
    : `SELECT * FROM codes ORDER BY received_at DESC LIMIT 100`;
  const stmt = groupId ? env.DB.prepare(sql).bind(groupId) : env.DB.prepare(sql);
  const { results } = await stmt.all();
  return json({ codes: results || [] }, 200, request);
}

async function handleCodesDelete(request, env, id) {
  await env.DB.prepare(`DELETE FROM codes WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, request);
}

async function handleCodesMarkUsed(request, env, id) {
  await env.DB.prepare(`UPDATE codes SET is_used = 1 WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, request);
}

// ============================================================
// LINE API
// ============================================================
async function handleLineList(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM line_bindings WHERE is_active = 1 ORDER BY is_default DESC, created_at DESC`
  ).all();
  return json({ bindings: results || [] }, 200, request);
}

async function handleLineCreate(request, env) {
  const url = new URL(request.url);
  const domain = normalizeDomain(url.hostname);
  const lic = await verifyLicense(env.LICENSE_KEY, domain, env.SECRET_SALT);

  if (!(await checkLineLimit(env, lic.edition))) {
    return json({ error: '已達版本 LINE 綁定數量上限' }, 403, request);
  }

  const body = await request.json().catch(() => ({}));
  const { line_group_id, channel_token, label, group_id } = body;
  if (!line_group_id || !channel_token) return json({ error: '缺少必要欄位' }, 400, request);

  await env.DB.prepare(
    `INSERT INTO line_bindings (group_id, label, line_group_id, channel_token, is_default, is_active, created_at)
     VALUES (?, ?, ?, ?, 0, 1, ?)`
  ).bind(group_id || null, label || null, line_group_id, channel_token, Date.now()).run();

  return json({ ok: true }, 200, request);
}

async function handleLineDelete(request, env, id) {
  await env.DB.prepare(`UPDATE line_bindings SET is_active = 0 WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, request);
}

// ============================================================
// 收信入口
// ============================================================
async function handleInbox(request, env, token) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM inboxes WHERE forward_token = ? AND is_active = 1`
  ).bind(token).all();
  const inbox = results?.[0];
  if (!inbox) return json({ error: 'invalid token' }, 404, request);

  const body = await request.json().catch(() => ({}));
  const text = body.text || body.body || '';
  const code = extractCode(text);
  if (!code) return json({ ok: false, reason: 'no_code' }, 200, request);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO codes (group_id, inbox_id, code, sender, subject, raw_snippet, received_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    inbox.group_id, inbox.id, code,
    body.from || null, body.subject || null, text.slice(0, 200),
    now, now
  ).run();

  const push = await pushLine(env, inbox.group_id, code, body.from);
  return json({ ok: true, code, pushed: push.ok }, 200, request);
}

// ============================================================
// LINE 推播（分流）
// ============================================================
async function pushLine(env, groupId, code, sender) {
  let binding = null;

  if (groupId) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM line_bindings WHERE group_id = ? AND is_active = 1 LIMIT 1`
    ).bind(groupId).all();
    binding = results?.[0];
  }

  if (!binding) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM line_bindings WHERE is_default = 1 AND is_active = 1 LIMIT 1`
    ).all();
    binding = results?.[0];
  }

  const token = binding?.channel_token || env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = binding?.line_group_id || env.LINE_DEFAULT_GROUP_ID;
  if (!token || !to) return { ok: false, reason: 'no_credentials' };

  const message = `🔐 驗證碼：${code}\n來源：${sender || '未知'}`;

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text: message }]
    })
  });

  return { ok: res.ok, status: res.status };
}

// ============================================================
// 路由
// ============================================================
async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS 預檢
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  // ---------- 初始化頁面 ----------
  if (path === '/init' && method === 'GET') {
    return html(initPage('', false));
  }

  if (path === '/init' && method === 'POST') {
    const formData = await request.formData().catch(() => null);
    let token = '';

    if (formData) {
      token = formData.get('token') || '';
    } else {
      const body = await request.json().catch(() => ({}));
      token = body.token || '';
    }

    const expected = env.INIT_TOKEN || '';
    if (!expected) {
      return html(initPage('系統未設定 INIT_TOKEN，請先在 Cloudflare 設定', false));
    }
    if (token !== expected) {
      return html(initPage('初始化密碼錯誤', false));
    }

    const results = await runInit(env);
    const failed = results.filter(r => !r.ok);
    if (failed.length === 0) {
      return html(initPage('✅ 資料庫初始化完成！<br><br>請前往 <a href="https://boxhax.pages.dev" style="color:#4f8cff">控制面板</a> 登入', true));
    } else {
      return html(initPage(`部分失敗：${failed.length} 個語句出錯<br>第一個錯誤：${failed[0].error}`, false));
    }
  }

  // ---------- 公開 API ----------
  if (path === '/api/login' && method === 'POST') return handleLogin(request, env);
  if (path === '/api/logout' && method === 'POST') return handleLogout(request);
  if (path === '/api/me' && method === 'GET') return handleMe(request, env);
  if (path === '/api/license' && method === 'GET') return handleLicense(request, env);

  // 收信入口
  if (path.startsWith('/inbox/') && method === 'POST') {
    return handleInbox(request, env, path.slice('/inbox/'.length));
  }

  // ---------- 需登入 ----------
  const loggedIn = await isValidSession(request, env);
  if (!loggedIn && path.startsWith('/api/')) return unauthorized(request);

  if (path === '/api/groups' && method === 'GET')  return handleGroupsList(request, env);
  if (path === '/api/groups' && method === 'POST') return handleGroupsCreate(request, env);

  let m;
  if ((m = path.match(/^\/api\/groups\/(\d+)$/))) {
    if (method === 'DELETE') return handleGroupsDelete(request, env, m[1]);
    if (method === 'PATCH')  return handleGroupsUpdate(request, env, m[1]);
  }

  if ((m = path.match(/^\/api\/groups\/(\d+)\/members$/))) {
    if (method === 'GET')  return handleMembersList(request, env, m[1]);
    if (method === 'POST') return handleMembersCreate(request, env, m[1]);
  }
  if ((m = path.match(/^\/api\/members\/(\d+)$/))) {
    if (method === 'DELETE') return handleMembersDelete(request, env, m[1]);
    if (method === 'PATCH')  return handleMembersUpdate(request, env, m[1]);
  }

  if (path === '/api/domains' && method === 'GET')  return handleDomainsList(request, env);
  if (path === '/api/domains' && method === 'POST') return handleDomainsCreate(request, env);
  if ((m = path.match(/^\/api\/domains\/(\d+)$/)) && method === 'DELETE') {
    return handleDomainsDelete(request, env, m[1]);
  }

  if (path === '/api/codes' && method === 'GET') return handleCodesList(request, env);
  if ((m = path.match(/^\/api\/codes\/(\d+)$/)) && method === 'DELETE') {
    return handleCodesDelete(request, env, m[1]);
  }
  if ((m = path.match(/^\/api\/codes\/(\d+)\/used$/)) && method === 'POST') {
    return handleCodesMarkUsed(request, env, m[1]);
  }

  if (path === '/api/line' && method === 'GET')  return handleLineList(request, env);
  if (path === '/api/line' && method === 'POST') return handleLineCreate(request, env);
  if ((m = path.match(/^\/api\/line\/(\d+)$/)) && method === 'DELETE') {
    return handleLineDelete(request, env, m[1]);
  }

  return json({ error: '未找到' }, 404, request);
}

// ============================================================
// 入口
// ============================================================
export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env);
    } catch (e) {
      await logEvent(env, 'error', e.message, { stack: e.stack });
      return json({ error: e.message }, 500, request);
    }
  }
};
};
