-- Verwaltungsansicht: Recht am Umgebungs-Datensatz, wie beim Kurator.
ALTER TABLE environments ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0;

-- Protokoll der Eingriffe. BEWUSST OHNE Fremdschluessel: ein Eintrag muss die
-- geloeschte Umgebung ueberleben - sonst raeumte gerade das Loeschen seinen
-- eigenen Nachweis weg. Festgehalten werden IDs und Aktionen, keine Inhalte.
CREATE TABLE IF NOT EXISTS admin_log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_env  BIGINT UNSIGNED NULL,
  action     VARCHAR(32)     NOT NULL,
  target_env BIGINT UNSIGNED NULL,
  note       VARCHAR(200)    NOT NULL DEFAULT '',
  created_at DATETIME        NOT NULL,
  PRIMARY KEY (id),
  KEY idx_al_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
