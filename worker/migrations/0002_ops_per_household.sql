-- Operation ids are unique per household and sequence numbers are unique per household.
-- Existing rows are renumbered in arrival order, so phones re-sync their cursor once.
CREATE TABLE list_op_v2 (
  household_id TEXT NOT NULL,
  op_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  week_id TEXT NOT NULL,
  key TEXT NOT NULL,
  checked INTEGER NOT NULL,
  covered_g REAL NOT NULL,
  by TEXT NOT NULL,
  at TEXT NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY (household_id, op_id),
  UNIQUE (household_id, seq)
);
INSERT INTO list_op_v2 (household_id, op_id, seq, week_id, key, checked, covered_g, by, at, rev)
SELECT household_id, op_id,
       ROW_NUMBER() OVER (PARTITION BY household_id ORDER BY seq, rowid),
       week_id, key, checked, covered_g, by, at, rev
FROM list_op;
DROP TABLE list_op;
ALTER TABLE list_op_v2 RENAME TO list_op;
CREATE INDEX IF NOT EXISTS list_op_household_key_at ON list_op (household_id, week_id, key, at DESC);
