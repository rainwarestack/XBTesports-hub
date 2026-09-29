ALTER TABLE profiles ADD COLUMN font_url TEXT NOT NULL DEFAULT '';
CREATE TABLE chat_presence(user_id TEXT PRIMARY KEY REFERENCES users(id),seen_at INTEGER NOT NULL);
CREATE INDEX chat_presence_seen ON chat_presence(seen_at);
CREATE TABLE friends(pair_key TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id),recipient_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL);
CREATE INDEX friends_recipient ON friends(recipient_id,status);
UPDATE profiles SET display_name='RainSoRanked',presence='online' WHERE user_id IN (SELECT id FROM users WHERE lower(handle)='rainsoranked');
