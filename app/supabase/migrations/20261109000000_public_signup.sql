-- Public event pages: anyone can sign up for a shareable event without logging in.
-- Those sign-ups are audited with via = 'signup' and no user (they aren't anyone's call).

ALTER TABLE status_changes ALTER COLUMN user_id DROP NOT NULL;

-- People who first arrive through a public sign-up page.
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts
  ADD CONSTRAINT contacts_source_check CHECK (source IN ('import','walk_in','manual','guest','signup'));
