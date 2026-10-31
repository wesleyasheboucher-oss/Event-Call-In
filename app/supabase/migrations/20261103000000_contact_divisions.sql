-- Contacts can belong to a division (the app currently offers Div 4 and Div 6).

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS division integer;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_division_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_division_check CHECK (division IS NULL OR division BETWEEN 1 AND 7);

CREATE INDEX IF NOT EXISTS contacts_division ON contacts(division) WHERE division IS NOT NULL;
