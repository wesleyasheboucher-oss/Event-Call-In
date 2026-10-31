-- Self sign-up: people request an account, admins approve it.
-- pending = 1 → waiting for approval (they can't sign in yet; active stays 0).
-- Locked accounts are active = 0 with pending = 0.

ALTER TABLE users ADD COLUMN IF NOT EXISTS pending integer NOT NULL DEFAULT 0;

-- People may sign up with only a phone number. NULL emails don't collide with the
-- unique constraint, so the "one account per email" rule still holds.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
