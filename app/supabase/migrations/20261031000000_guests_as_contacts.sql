-- Plus-ones become real people: each guest is a contact with their own
-- registration, linked to the registration of the person who brought them.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS guest_of integer REFERENCES registrations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS registrations_guest_of ON registrations(guest_of) WHERE guest_of IS NOT NULL;

-- The anonymous head count is replaced by the linked guest registrations.
ALTER TABLE registrations DROP COLUMN IF EXISTS guests;

-- Guests are their own contact source (name required; phone/email optional).
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts
  ADD CONSTRAINT contacts_source_check CHECK (source IN ('import','walk_in','manual','guest'));
