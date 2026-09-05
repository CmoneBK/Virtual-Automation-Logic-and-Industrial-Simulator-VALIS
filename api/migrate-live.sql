-- Nachtraeglich fuer bestehende Installationen: gemeinsame Bearbeitung.
-- Bei Neuinstallationen sind die Spalten bereits in schema.sql enthalten.
ALTER TABLE objects
  ADD COLUMN live_on    TINYINT(1)  NOT NULL DEFAULT 0,
  ADD COLUMN live_owner VARCHAR(40) NULL,
  ADD COLUMN live_until DATETIME    NULL;
