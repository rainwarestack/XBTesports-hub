ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE session_auth_versions (
 token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
 auth_version INTEGER NOT NULL
);
CREATE TABLE account_security (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 email TEXT COLLATE NOCASE UNIQUE,
 totp_secret TEXT,
 last_step INTEGER NOT NULL DEFAULT -1,
 backup_hashes TEXT NOT NULL DEFAULT '[]',
 pending_secret TEXT,
 pending_until INTEGER
);
CREATE TABLE auth_challenges (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 auth_version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE account_email_tokens (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
 email TEXT NOT NULL,
 auth_version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX account_email_expiry ON account_email_tokens(expires_at);
CREATE INDEX auth_challenge_expiry ON auth_challenges(expires_at);
