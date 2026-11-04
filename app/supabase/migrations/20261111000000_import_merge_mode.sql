-- Imports gain a "merge" mode: fill in blanks and add new phone numbers without replacing any.

ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_mode_check;
ALTER TABLE imports ADD CONSTRAINT imports_mode_check CHECK (mode IN ('skip','merge','update'));
