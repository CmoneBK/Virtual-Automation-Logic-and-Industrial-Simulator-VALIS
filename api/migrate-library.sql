-- Bibliothek: veroeffentlichte Kopien von Aufgaben, Paketen und Szenarien.
-- Bewusst eine EIGENE Tabelle: eine Veroeffentlichung ist eine Kopie und
-- unabhaengig davon, was der Urheber spaeter in seiner Umgebung tut.
-- status: pending = eingereicht, public = freigegeben, rejected = abgelehnt.
CREATE TABLE IF NOT EXISTS library (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  env_id     BIGINT UNSIGNED NULL,
  kind       VARCHAR(32)     NOT NULL,
  title      VARCHAR(200)    NOT NULL,
  descr      VARCHAR(1000)   NOT NULL DEFAULT '',
  data       LONGTEXT        NOT NULL,
  bytes      INT UNSIGNED    NOT NULL DEFAULT 0,
  status     VARCHAR(10)     NOT NULL DEFAULT 'pending',
  created_at DATETIME        NOT NULL,
  updated_at DATETIME        NOT NULL,
  hits       INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_status (status, kind),
  KEY idx_env (env_id),
  CONSTRAINT fk_lib_env FOREIGN KEY (env_id) REFERENCES environments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE environments ADD COLUMN is_curator TINYINT(1) NOT NULL DEFAULT 0;
