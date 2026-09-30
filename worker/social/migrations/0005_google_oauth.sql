ALTER TABLE oauth_flows ADD COLUMN provider TEXT NOT NULL DEFAULT 'discord';
ALTER TABLE oauth_flows ADD COLUMN provider_verifier TEXT NOT NULL DEFAULT '';
