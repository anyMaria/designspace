-- 003_crop.sql — Patch 2 (docs/PATCH_2_PLAN.md, C3): a crop focus per placement.
-- Never edit this file after it ships; add 006_… instead (§5.3).
ALTER TABLE placements ADD COLUMN crop_x REAL; -- 0..1 like CSS object-position under object-fit: cover; NULL = not cropped by the owner
ALTER TABLE placements ADD COLUMN crop_y REAL;
