-- Phase 2a: lead import + CDL / medical card photos.

ALTER TABLE leads ADD COLUMN state TEXT;
ALTER TABLE leads ADD COLUMN cdl TEXT;
ALTER TABLE leads ADD COLUMN medical_card TEXT;

-- Photos/PDFs attached to a lead (CDL, medical card, anything else).
-- Stored inline as base64 (images are shrunk in the browser first, capped at
-- ~1.4 MB per file) so no extra storage service is needed. Like every other
-- app table this carries user_id and is only touched via src/db/scoped.ts.
CREATE TABLE lead_documents (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'other',
  file_name TEXT,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX lead_documents_user_lead_idx ON lead_documents (user_id, lead_id);
