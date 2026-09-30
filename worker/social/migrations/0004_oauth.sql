CREATE TABLE oauth_flows (
 state_hash TEXT PRIMARY KEY, verifier_hash TEXT NOT NULL,
 user_id TEXT REFERENCES users(id), subject TEXT,
 expires_at INTEGER NOT NULL
);
CREATE TABLE oauth_identities (
 provider TEXT NOT NULL, subject TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(provider,subject), UNIQUE(provider,user_id)
);
