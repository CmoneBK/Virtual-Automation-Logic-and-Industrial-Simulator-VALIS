-- VALIS Cloud – Schema (MariaDB, utf8mb4)
-- In KeyHelp eine Datenbank anlegen, dann:  mysql -u USER -p DBNAME < schema.sql
--
-- Datenschutz-Design:
--   * kein Name, keine E-Mail, kein Geburtsdatum, keine Adresse
--   * keine Zuordnungstabelle Code -> Person (bewusst nicht vorhanden)
--   * Codes nur als Hash (mit serverseitigem Pepper)
--   * IP-Adressen nur als tagesgesalzener Hash in rate_limits, mit TTL

CREATE TABLE IF NOT EXISTS environments (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code_hash     CHAR(64)        NOT NULL,
  pin_hash      VARCHAR(255)    NULL,
  created_at    DATETIME        NOT NULL,
  last_seen_at  DATETIME        NOT NULL,
  bytes_used    INT UNSIGNED    NOT NULL DEFAULT 0,
  obj_count     INT UNSIGNED    NOT NULL DEFAULT 0,
  failed_logins SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until  DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_code (code_hash),
  KEY idx_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64)        NOT NULL,
  env_id     BIGINT UNSIGNED NOT NULL,
  created_at DATETIME        NOT NULL,
  expires_at DATETIME        NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_env (env_id),
  KEY idx_expires (expires_at),
  CONSTRAINT fk_sessions_env FOREIGN KEY (env_id) REFERENCES environments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ein Objekt = ein VALIS-Artefakt in seinem BESTEHENDEN Format
-- (Snapshot-Bundle, .valitask, .valipack, .valisscenario, ...).
CREATE TABLE IF NOT EXISTS objects (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  env_id     BIGINT UNSIGNED NOT NULL,
  kind       VARCHAR(32)     NOT NULL,
  obj_uid    CHAR(36)        NOT NULL,
  name       VARCHAR(200)    NOT NULL DEFAULT '',
  data       LONGTEXT        NOT NULL,
  bytes      INT UNSIGNED    NOT NULL DEFAULT 0,
  version    INT UNSIGNED    NOT NULL DEFAULT 1,
  updated_at DATETIME        NOT NULL,
  deleted_at DATETIME        NULL,
  -- Gemeinsame Bearbeitung (Stift-Weitergabe): live_on schaltet den Modus,
  -- live_owner haelt die Geraetekennung des Stiftinhabers, live_until ist der
  -- Herzschlag. Laeuft er ab, ist der Stift automatisch wieder frei - sonst
  -- bliebe er nach einem geschlossenen Tab fuer immer vergeben.
  live_on    TINYINT(1)      NOT NULL DEFAULT 0,
  live_owner VARCHAR(40)     NULL,
  live_until DATETIME        NULL,
  -- Zeitpunkt der letzten Stift-Anfrage. Der Inhaber sieht daran, dass jemand
  -- uebernehmen moechte; sonst bliebe ein Klick des anderen voellig unsichtbar.
  live_req_at DATETIME       NULL,
  -- Betriebsart der Zusammenarbeit: 'pen' = Stift-Weitergabe (einer schreibt),
  -- 'rt' = Echtzeit (alle schreiben, Staende werden zusammengefuehrt).
  live_mode  VARCHAR(8)      NOT NULL DEFAULT 'pen',
  PRIMARY KEY (id),
  UNIQUE KEY uq_obj (env_id, kind, obj_uid),
  KEY idx_env_kind (env_id, kind, deleted_at),
  CONSTRAINT fk_objects_env FOREIGN KEY (env_id) REFERENCES environments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Read-only Freigabe einzelner Objekte (ersetzt lange LZString-URLs).
CREATE TABLE IF NOT EXISTS shares (
  token_hash CHAR(64)        NOT NULL,
  object_id  BIGINT UNSIGNED NOT NULL,
  created_at DATETIME        NOT NULL,
  expires_at DATETIME        NULL,
  hits       INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (token_hash),
  KEY idx_object (object_id),
  CONSTRAINT fk_shares_obj FOREIGN KEY (object_id) REFERENCES objects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Geraete-Links. Bewusst NICHT dasselbe wie eine Sitzung: ein Link soll ein
-- Abmelden ueberleben, sonst waere eine Verknuepfung auf dem Rechner nach dem
-- ersten Abmelden dauerhaft wertlos. Beim Oeffnen wird das Link-Token gegen
-- eine frische Sitzung eingetauscht.
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

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       VARCHAR(48) NOT NULL,
  window_start BIGINT      NOT NULL,
  hits         INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket),
  KEY idx_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
