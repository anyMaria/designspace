-- 002_patch1.sql — Patch 1 (docs/PATCH_1_PLAN.md): palettes, long descriptions, thumbnail versions.
-- Never edit this file after it ships; add 003_… instead (§5.3).
ALTER TABLE items ADD COLUMN swatch_colors TEXT;                -- swatch/palette: JSON [{"hex":"#RRGGBB","name":"…"}]
ALTER TABLE items ADD COLUMN description TEXT;                  -- TipTap JSON (same format as a note's body)
ALTER TABLE items ADD COLUMN description_text TEXT;             -- plain text of `description`, for search
ALTER TABLE items ADD COLUMN thumb_v INTEGER NOT NULL DEFAULT 0; -- +1 every time t128/t512 are rewritten (F1)
