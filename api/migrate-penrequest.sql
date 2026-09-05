-- Nachtraeglich fuer bestehende Installationen: Anfrage nach dem Stift.
ALTER TABLE objects ADD COLUMN live_req_at DATETIME NULL;
