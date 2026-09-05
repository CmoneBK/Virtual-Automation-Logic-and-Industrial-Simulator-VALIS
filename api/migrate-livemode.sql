-- Nachtraeglich fuer bestehende Installationen: Betriebsart der Zusammenarbeit.
-- 'pen' = Stift-Weitergabe (einer schreibt), 'rt' = Echtzeit (alle schreiben,
-- Staende werden zusammengefuehrt).
ALTER TABLE objects ADD COLUMN live_mode VARCHAR(8) NOT NULL DEFAULT 'pen';
