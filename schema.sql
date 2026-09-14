-- ============================================================
-- BoxHax by Nova - D1 (SQLite) Schema v2
-- ============================================================

-- ------------------------------------------------------------
-- 1. 授權與版本
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS license (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  license_key       TEXT,
  edition           TEXT NOT NULL DEFAULT 'community',
  bound_domain      TEXT,
  expires_at        INTEGER,
  activated_at      INTEGER,
  last_checked_at   INTEGER,
  is_valid          INTEGER NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------
-- 2. 管理員（獨立，不屬於任何團隊）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  username          TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  last_login_at     INTEGER
);

-- ------------------------------------------------------------
-- 3. 團隊（每個團隊一個專屬信箱）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE,
  inbox_email       TEXT,
  inbox_password    TEXT,
  inbox_provider    TEXT,
  max_members       INTEGER DEFAULT 5,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_groups_slug ON groups(slug);

-- ------------------------------------------------------------
-- 4. 成員（每個成員屬於一個團隊）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id          INTEGER NOT NULL,
  username          TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  display_name      TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        INTEGER NOT NULL,
  last_login_at     INTEGER,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_members_username ON members(username);

-- ------------------------------------------------------------
-- 5. 驗證碼（每團隊只保留最新一則）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS codes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id          INTEGER UNIQUE NOT NULL,
  code              TEXT NOT NULL,
  sender            TEXT,
  subject           TEXT,
  raw_snippet       TEXT,
  received_at       INTEGER NOT NULL,
  created_at        INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_codes_group ON codes(group_id);

-- ------------------------------------------------------------
-- 6. 收信轉寄 token
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inbox_tokens (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id          INTEGER UNIQUE NOT NULL,
  token             TEXT UNIQUE NOT NULL,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_tokens_token ON inbox_tokens(token);

-- ------------------------------------------------------------
-- 7. 網域映射（多網域動態映射）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id          INTEGER,
  domain            TEXT NOT NULL,
  is_primary        INTEGER NOT NULL DEFAULT 0,
  verified          INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_unique ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_domains_group ON domains(group_id);

-- ------------------------------------------------------------
-- 8. LINE 推播綁定
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS line_bindings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id          INTEGER,
  label             TEXT,
  line_group_id     TEXT NOT NULL,
  channel_token     TEXT,
  is_default        INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_line_group ON line_bindings(group_id);
CREATE INDEX IF NOT EXISTS idx_line_default ON line_bindings(is_default);

-- ------------------------------------------------------------
-- 9. LINE 推播紀錄
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id           INTEGER,
  binding_id        INTEGER,
  status            TEXT NOT NULL,
  response          TEXT,
  created_at        INTEGER NOT NULL,
  FOREIGN KEY (code_id) REFERENCES codes(id) ON DELETE CASCADE,
  FOREIGN KEY (binding_id) REFERENCES line_bindings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_push_logs_code ON push_logs(code_id);

-- ------------------------------------------------------------
-- 10. 稽核紀錄
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type        TEXT NOT NULL,
  actor_type        TEXT,
  actor_id          INTEGER,
  message           TEXT,
  meta              TEXT,
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_type_time ON system_events(event_type, created_at DESC);

-- ------------------------------------------------------------
-- 11. 初始資料
-- ------------------------------------------------------------
INSERT INTO license (edition, is_valid)
SELECT 'community', 0
WHERE NOT EXISTS (SELECT 1 FROM license);
