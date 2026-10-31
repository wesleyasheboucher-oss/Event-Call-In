-- Team members can sign in with their phone number as well as their email.
-- Stored as digits only (same normalization as contacts), unique when present.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone <> '';
