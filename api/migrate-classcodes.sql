-- Klassen-Freigabecodes: Verteilweg in eine Richtung, ausdruecklich KEINE
-- Gruppenzuordnung. Der Code verweist auf eine Liste von Objekten der
-- erzeugenden Umgebung; eingeloest wird lesend.
--
-- `code` steht im Klartext: er muss noch in der naechsten Stunde vorlesbar
-- sein und gibt nur Lesezugriff auf Objekte, die in derselben Datenbank
-- ohnehin liegen. Umgebungscodes sind gehasht - die geben Schreibrecht.
CREATE TABLE IF NOT EXISTS class_codes (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(12)     NOT NULL,
  env_id         BIGINT UNSIGNED NOT NULL,
  label          VARCHAR(120)    NOT NULL DEFAULT '',
  items          TEXT            NOT NULL,
  created_at     DATETIME        NOT NULL,
  expires_at     DATETIME        NULL,
  revoked_at     DATETIME        NULL,
  redeems        INT UNSIGNED    NOT NULL DEFAULT 0,
  last_redeem_at DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cc_code (code),
  KEY idx_cc_env (env_id),
  CONSTRAINT fk_cc_env FOREIGN KEY (env_id) REFERENCES environments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
