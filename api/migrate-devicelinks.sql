-- Nachtraeglich fuer bestehende Installationen: eigene Tabelle fuer
-- Geraete-Links. Vorher steckte im Link ein Sitzungs-Token - ein Abmelden
-- machte die Verknuepfung damit dauerhaft unbrauchbar.
CREATE TABLE IF NOT EXISTS device_links (
  token_hash   CHAR(64)        NOT NULL,
  env_id       BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME        NOT NULL,
  expires_at   DATETIME        NULL,
  last_used_at DATETIME        NULL,
  uses         INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (token_hash),
  KEY idx_env (env_id),
  CONSTRAINT fk_devlinks_env FOREIGN KEY (env_id) REFERENCES environments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
