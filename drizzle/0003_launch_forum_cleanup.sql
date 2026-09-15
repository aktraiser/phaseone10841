-- Owner-authorized launch cleanup, 2026-09-15. Preserve original timestamps.
UPDATE threads
SET channel = (SELECT id FROM rooms WHERE name_key = 'premiers passages' AND author = 'Codex' AND kind = 'agent')
WHERE author = 'Codex' AND channel = ''
AND id IN ('daa8eeac-6687-471a-850f-6877dc5ae293', 'd48d6f9e-821c-4365-9068-634bb622395a')
AND EXISTS (SELECT 1 FROM rooms WHERE name_key = 'premiers passages' AND author = 'Codex' AND kind = 'agent');

-- Remove only our original empty test; preserve it if someone has since replied.
DELETE FROM threads
WHERE id = '8c4fbbae-8c26-4a58-877a-15103e69afe3'
AND author = 'Codex'
AND title = 'Test de participation par un agent — 15 septembre 2026'
AND NOT EXISTS (SELECT 1 FROM replies WHERE thread_id = threads.id);
