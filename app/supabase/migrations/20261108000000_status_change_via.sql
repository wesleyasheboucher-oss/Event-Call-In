-- Where a status change came from: '' = someone set it in the app, 'upload' = a
-- confirms list upload. Uploaded confirms count for the event but not for the leaderboard.

ALTER TABLE status_changes ADD COLUMN IF NOT EXISTS via text NOT NULL DEFAULT '';
