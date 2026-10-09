-- Better Auth core tables (generated via `npx @better-auth/cli generate`)
CREATE TABLE "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);

CREATE TABLE "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

CREATE TABLE "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

CREATE TABLE "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

-- Driver Desk app tables. Every row below carries user_id: see src/db/scoped.ts,
-- which is the only code path allowed to read or write these tables.

CREATE TABLE leads (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT,
  notes TEXT,
  custom_data TEXT NOT NULL DEFAULT '{}',
  next_follow_up_at TEXT,
  last_contacted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX leads_user_idx ON leads (user_id);
CREATE INDEX leads_user_status_idx ON leads (user_id, status);
CREATE INDEX leads_user_followup_idx ON leads (user_id, next_follow_up_at);

CREATE TABLE custom_fields (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  options TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, field_key)
);

CREATE INDEX custom_fields_user_idx ON custom_fields (user_id);

CREATE TABLE info_templates (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX info_templates_user_idx ON info_templates (user_id);

CREATE TABLE message_templates (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  title TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX message_templates_user_idx ON message_templates (user_id);

CREATE TABLE call_logs (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'outbound',
  outcome TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX call_logs_user_lead_idx ON call_logs (user_id, lead_id);
CREATE INDEX call_logs_user_created_idx ON call_logs (user_id, created_at);
