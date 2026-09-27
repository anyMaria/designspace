-- 001_init.sql — the initial schema. See docs/IMPLEMENTATION_PLAN.md §5.2.
-- Never edit a migration that has shipped; add a new numbered file instead (§5.3).

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- schema_version, library_id, created_at, settings (JSON)
);

CREATE TABLE boards (
  id            TEXT PRIMARY KEY,                 -- ULID
  kind          TEXT NOT NULL CHECK (kind IN ('library','board')),  -- exactly one 'library' row
  name          TEXT NOT NULL,
  source_filter TEXT,                             -- JSON Filter used to create the board
  settings      TEXT,                             -- JSON: background, connection criteria, dismissed suggestions
  camera        TEXT,                             -- JSON { x, y, zoom }
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

CREATE TABLE items (
  id              TEXT PRIMARY KEY,               -- ULID (sorts by creation time)
  kind            TEXT NOT NULL CHECK (kind IN ('image','video','pdf','font','link','note','swatch')),
  title           TEXT NOT NULL DEFAULT '',
  file_path       TEXT,                           -- relative to the library root
  file_name       TEXT,                           -- original file name
  file_hash       TEXT,                           -- SHA-256 hex of the original
  file_size       INTEGER,
  mime            TEXT,
  width           INTEGER,
  height          INTEGER,
  duration_ms     INTEGER,                        -- video
  poster_ms       INTEGER,                        -- video cover frame
  page_count      INTEGER,                        -- pdf
  cover_page      INTEGER,                        -- pdf, 1-based
  cover_path      TEXT,                           -- link preview image (relative)
  url             TEXT,                            -- link URL
  source_url      TEXT,                           -- where the media came from
  artist          TEXT,
  why             TEXT,                            -- "Why I saved this"
  body            TEXT,                            -- note: TipTap JSON
  body_text       TEXT,                            -- note: plain text for search
  color           TEXT,                            -- swatch HEX or note color token
  font_meta       TEXT,                            -- JSON
  link_meta       TEXT,                            -- JSON
  palette         TEXT,                            -- JSON [{ hex, weight }]
  color_families  TEXT,                            -- JSON ["blue", …]
  phash           TEXT,                            -- 16 hex characters
  favorite        INTEGER NOT NULL DEFAULT 0,
  sorted_at       TEXT,                            -- NULL = in the Inbox (media kinds only)
  viewed_at       TEXT,                            -- last Focus view or long selection (Rediscover)
  origin_board_id TEXT REFERENCES boards(id),      -- board-only notes/swatches; NULL = library
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','unsupported','error')),
  derived_v       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX items_kind    ON items(kind);
CREATE INDEX items_created ON items(created_at);
CREATE INDEX items_hash    ON items(file_hash);

CREATE TABLE terms (
  id         TEXT PRIMARY KEY,
  facet      TEXT NOT NULL CHECK (facet IN ('type','vibe','movement','tag')),
  name       TEXT NOT NULL,
  name_norm  TEXT NOT NULL,                        -- lowercase, accents stripped
  ai_hint    TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (facet, name_norm)
);

CREATE TABLE item_terms (
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  term_id  TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  via      TEXT NOT NULL DEFAULT 'user' CHECK (via IN ('user','ai')),
  added_at TEXT NOT NULL,
  PRIMARY KEY (item_id, term_id)
);
CREATE INDEX item_terms_term ON item_terms(term_id);

CREATE TABLE frames (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  z          INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE placements (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  z        INTEGER NOT NULL DEFAULT 0,
  frame_id TEXT REFERENCES frames(id) ON DELETE SET NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (board_id, item_id)
);
CREATE INDEX placements_item ON placements(item_id);

CREATE TABLE manual_connections (
  id         TEXT PRIMARY KEY,
  from_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  label      TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (from_id, to_id)
);

CREATE TABLE saved_filters (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  filter     TEXT NOT NULL,                        -- JSON Filter
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE embeddings (
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  model      TEXT NOT NULL,
  vector     BLOB NOT NULL,                        -- Float32 little-endian, L2-normalized
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, model)
);

CREATE TABLE ai_dismissed (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, term_id)
);
