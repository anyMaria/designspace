-- 004_vocabulary.sql — Patch 2 (D3): five starter Movement values that read as moods become Vibes
-- (keeping their items and AI hints); "Contemporary" goes when nothing uses it.
-- Never edit this file after it ships.
UPDATE terms SET facet = 'vibe', sort = sort + 1000
  WHERE facet = 'movement'
    AND name_norm IN ('psychedelic', 'grunge', 'punk', 'y2k', 'vaporwave')
    AND NOT EXISTS (SELECT 1 FROM terms v WHERE v.facet = 'vibe' AND v.name_norm = terms.name_norm);
DELETE FROM terms
  WHERE facet = 'movement' AND name_norm = 'contemporary'
    AND NOT EXISTS (SELECT 1 FROM item_terms it WHERE it.term_id = terms.id);
