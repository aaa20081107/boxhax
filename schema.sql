-- ============================================================
-- BoxHax by Nova - D1 (SQLite) Schema
-- ============================================================

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

CREATE TABLE IF NOT EXISTS groups (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE,
  owner_member_id   INTEGER,
  max_members       INTEGER DEFAULT 5,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER
);

CREATE TABLE IF NOT EXISTS members (
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
);

CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_members_role  ON members(group_id, role);

CREATE TABLE IF NOT EXISTS domains (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id          INTEGER NOT NULL,
  domain            TEXT NOT NULL,
  is_primary        INTEGER NOT NULL DEFAULT 0,
  verified          INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_unique ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_domains_group ON domains(group_id);

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

CREATE TABLE IF NOT EXISTS inboxes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id          INTEGER NOT NULL,
  address           TEXT NOT NULL,
  provider          TEXT,
  forward_token     TEXT UNIQUE,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inboxes_group ON inboxes(group_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inboxes_token ON inboxes(forward_token);

CREATE TABLE IF NOT EXISTS codes (
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
);

CREATE INDEX IF NOT EXISTS idx_codes_group_time ON codes(group_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_codes_code ON codes(code);
CREATE INDEX IF NOT EXISTS idx_codes_pushed ON codes(pushed);

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

CREATE TABLE IF NOT EXISTS system_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type        TEXT NOT NULL,
  message           TEXT,
  meta              TEXT,
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_type_time ON system_events(event_type, created_at DESC);

INSERT INTO license (edition, is_valid)
SELECT 'community', 0
WHERE NOT EXISTS (SELECT 1 FROM license);