-- Contact fields from the Tampa Foundation lists: a second phone, training and
-- processing levels, FSM, and whether the person is active.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS alt_phone text NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS training_level text NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS processing_level text NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS fsm_name text NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS active integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS contacts_alt_phone ON contacts(alt_phone) WHERE alt_phone <> '';
