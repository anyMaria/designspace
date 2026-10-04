-- 005_fonts.sql — Patch 2 (F1): font families (one item, several files), card options, type
-- collections. Never edit this file after it ships.
CREATE TABLE font_files (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_hash   TEXT NOT NULL,
  file_size   INTEGER,
  mime        TEXT,
  style_name  TEXT NOT NULL DEFAULT '',
  weight      INTEGER NOT NULL DEFAULT 400,
  italic      INTEGER NOT NULL DEFAULT 0,
  axes        TEXT,
  instances   TEXT,
  meta        TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX font_files_item ON font_files(item_id);
CREATE INDEX font_files_hash ON font_files(file_hash);
ALTER TABLE items ADD COLUMN font_family_key TEXT;
ALTER TABLE items ADD COLUMN font_card TEXT;
ALTER TABLE items ADD COLUMN font_collection TEXT;
ALTER TABLE placements ADD COLUMN parent_id TEXT REFERENCES items(id) ON DELETE SET NULL;
CREATE INDEX items_font_family ON items(font_family_key);
INSERT INTO font_files (id, item_id, file_path, file_name, file_hash, file_size, mime, style_name, axes, meta, created_at, deleted_at)
  SELECT id, id, file_path, COALESCE(file_name, ''), COALESCE(file_hash, ''), file_size, mime,
         COALESCE(json_extract(font_meta, '$.subfamily'), ''), json_extract(font_meta, '$.variableAxes'),
         font_meta, created_at, NULL
  FROM items WHERE kind = 'font' AND file_path IS NOT NULL;
