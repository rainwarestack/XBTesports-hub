ALTER TABLE profiles ADD COLUMN verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1));

UPDATE profiles SET verified = 1
WHERE user_id = (SELECT id FROM users WHERE handle = 'rainsoranked' COLLATE NOCASE);
