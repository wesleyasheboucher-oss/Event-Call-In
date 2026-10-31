-- Passwords set by an admin are temporary: the person must choose their own on next sign-in.

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password integer NOT NULL DEFAULT 0;
