-- wechat plugin schema.
--
-- Owned entirely by this plugin: the `p_wechat_` prefix is enforced by the migration runner, which
-- refuses DDL against any table the plugin does not own.
--
-- ## No foreign key to `users`
--
-- The ruling `plugins/pet/migrations/0001_init.sql` and `plugins/ai-study/migrations/0001_init.sql`
-- record: `users` belongs to `plugins/identity`, a cross-owner foreign key is exactly the coupling
-- the plugin boundary exists to prevent, and referential integrity for `user_id` is the port's job.
-- It would also make this migration fail on a database where `users` does not exist yet, and it
-- would make the account-deletion order a schema detail instead of a declared cleanup rule.
--
-- ## Why `user_id` is unique
--
-- One account, one WeChat. The binding is what `wx.login` resolves to, so two rows for one account
-- would make "which openid is mine" ambiguous and give the same person two independent silent-login
-- paths. `UNIQUE (user_id)` makes the rebind (new phone, reinstalled WeChat) an *update* the
-- repository performs inside one transaction rather than a second row nobody notices.
--
-- ## Why tickets are stored hashed
--
-- The ticket is a short-lived bearer credential: whoever presents it, together with the account
-- password, binds their openid to that account. Only the SHA-256 digest is stored, for the same
-- reason `sessions` stores digests - a database read must not yield a usable credential.
--
-- `created_at` / `expires_at` / `consumed_at` are ISO TEXT written by the application, matching the
-- other plugin tables in this repository, not SQLite's `CURRENT_TIMESTAMP`.

CREATE TABLE IF NOT EXISTS p_wechat_accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- WeChat's identifier for (person, this mini program). Unique: one openid maps to one account.
  openid        TEXT    NOT NULL UNIQUE,
  -- Only present when the mini program is bound to an Open Platform account. Recorded for a future
  -- cross-app identity, never required.
  unionid       TEXT,
  -- A `users` row owned by `plugins/identity`. No foreign key: see the header.
  user_id       INTEGER NOT NULL,
  -- The role at bind time, for auditing and for the case where the accounts table is inspected
  -- without a join. The authority is always the row identity returns.
  role          TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  last_login_at TEXT
);

-- One WeChat per account; see the header.
CREATE UNIQUE INDEX IF NOT EXISTS idx_p_wechat_accounts_user ON p_wechat_accounts (user_id);

CREATE TABLE IF NOT EXISTS p_wechat_login_tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- SHA-256 hex of the ticket handed to the client. The plaintext exists only in one response body.
  ticket_hash TEXT    NOT NULL UNIQUE,
  openid      TEXT    NOT NULL,
  -- Carried from the code2session response to the bind step, because a code cannot be exchanged
  -- twice and the unionid would otherwise be lost between the two requests.
  unionid     TEXT,
  expires_at  TEXT    NOT NULL,
  -- Non-NULL once used. Single use is enforced by the UPDATE ... WHERE consumed_at IS NULL.
  consumed_at TEXT,
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_p_wechat_tickets_expires ON p_wechat_login_tickets (expires_at);
CREATE INDEX IF NOT EXISTS idx_p_wechat_tickets_openid ON p_wechat_login_tickets (openid);
