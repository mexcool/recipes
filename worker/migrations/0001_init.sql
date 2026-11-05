CREATE TABLE IF NOT EXISTS household (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  doc TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS list_op (
  op_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  week_id TEXT NOT NULL,
  key TEXT NOT NULL,
  checked INTEGER NOT NULL,
  covered_g REAL NOT NULL,
  by TEXT NOT NULL,
  at TEXT NOT NULL,
  rev INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS list_op_household_seq ON list_op (household_id, seq);
