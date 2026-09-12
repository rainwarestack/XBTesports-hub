CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data)),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  start TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS calendar_events_public_start ON calendar_events (visibility, start);
