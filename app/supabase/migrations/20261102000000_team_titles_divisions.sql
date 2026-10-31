-- Team members have a position title and belong to a division (1–7).

ALTER TABLE users ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS division integer;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_division_check;
ALTER TABLE users ADD CONSTRAINT users_division_check CHECK (division IS NULL OR division BETWEEN 1 AND 7);
