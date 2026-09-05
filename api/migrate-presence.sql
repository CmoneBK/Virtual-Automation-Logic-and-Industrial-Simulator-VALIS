-- Anwesenheit: Schreibmarke im Code-Editor und Mauszeiger in der 2D-Anlage.
-- Bewusst fluechtig - Zeilen aelter als ~15 s gelten als abwesend und werden
-- weggeraeumt. Kein Name, keine Kennung einer Person: nur die zufaellige
-- Geraetekennung und eine daraus abgeleitete Farbe.
CREATE TABLE IF NOT EXISTS presence (
  object_id  BIGINT UNSIGNED NOT NULL,
  device     VARCHAR(40)     NOT NULL,
  caret      INT             NOT NULL DEFAULT -1,
  caret_end  INT             NOT NULL DEFAULT -1,
  mx         INT             NULL,
  my         INT             NULL,
  updated_at DATETIME        NOT NULL,
  PRIMARY KEY (object_id, device),
  KEY idx_upd (updated_at),
  CONSTRAINT fk_pres_obj FOREIGN KEY (object_id) REFERENCES objects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
