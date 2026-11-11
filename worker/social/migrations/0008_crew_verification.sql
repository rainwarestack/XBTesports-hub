ALTER TABLE groups ADD COLUMN verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1));

UPDATE groups SET verified = 1 WHERE id IN (
  '045161ee-ff89-44f4-a476-f1863a7b92fa',
  '131a9838-17ee-4d67-86b6-7fbbc23e2762',
  '2a45acfe-1250-43bc-8b25-cf422e7c77bd',
  '58ed1dcf-9f07-4d01-8022-9feb8ee99a6b'
);
