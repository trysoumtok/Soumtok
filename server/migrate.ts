import { getMigrations } from 'better-auth/db/migration'
import { auth } from './auth.ts'
import { pool } from './db.ts'
import { hasDatabase } from './env.ts'

const documentsSql = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents (user_id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS documents_user_folder_idx ON documents (user_id, folder);
`

const profilesSql = `
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  how_found TEXT,
  how_found_other TEXT,
  country TEXT,
  state TEXT,
  po_box TEXT,
  birth_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON profiles (lower(username))
  WHERE username IS NOT NULL;
`

const profileVerifySql = `
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_login TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_path TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_role TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_logo_path TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_idx
  ON profiles (phone)
  WHERE phone IS NOT NULL;
`

const verificationSql = `
CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  destination TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS verification_codes_user_idx
  ON verification_codes (user_id, channel, created_at DESC);
`

const filesSql = `
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS files_user_id_idx ON files (user_id);
`

const workspaceSql = `
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  path TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analytics_events_user_idx ON analytics_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provider_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT,
  key_ciphertext TEXT NOT NULL,
  last4 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  billed_to TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usage_events_user_idx ON usage_events (user_id, created_at DESC);
`

const settingsSql = `
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_links JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_profile BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS share_usage_data BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS light_theme TEXT NOT NULL DEFAULT 'soumtok-light';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dark_theme TEXT NOT NULL DEFAULT 'soumtok-dark';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pr_provider TEXT NOT NULL DEFAULT 'github';
`

const automationsSql = `
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  active BOOLEAN NOT NULL DEFAULT false,
  repo_id TEXT,
  repo_name TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  model TEXT,
  triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools JSONB NOT NULL DEFAULT '[{"id":"memories","type":"memories","label":"Memories"}]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS automations_user_idx ON automations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS automation_runs_auto_idx ON automation_runs (automation_id, created_at DESC);
`

const billingSql = `
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'hobby';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT;

CREATE TABLE IF NOT EXISTS billing_catalog (
  plan_id TEXT PRIMARY KEY,
  paypal_product_id TEXT,
  paypal_plan_id TEXT,
  amount TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  provider TEXT NOT NULL,
  paypal_subscription_id TEXT,
  paypal_order_id TEXT,
  status TEXT NOT NULL,
  amount TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS cycle TEXT DEFAULT 'monthly';
ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ;
ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ;
ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS receipt_number TEXT;
ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;
ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS checkout_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_cycle TEXT DEFAULT 'monthly';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS billing_orders_user_idx ON billing_orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  paypal_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

const accountKeysSql = `
CREATE TABLE IF NOT EXISTS user_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last4 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS user_api_keys_user_idx ON user_api_keys (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ssh_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ssh_keys_user_idx ON ssh_keys (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_plugins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mcp',
  mcp_url TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plugin_id)
);
ALTER TABLE user_plugins ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE user_plugins ADD COLUMN IF NOT EXISTS mcps JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE user_plugins ADD COLUMN IF NOT EXISTS bundle_path TEXT;
ALTER TABLE user_plugins ADD COLUMN IF NOT EXISTS publisher TEXT;
ALTER TABLE user_plugins ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE user_plugins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS user_plugins_user_idx ON user_plugins (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_connectors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'web',
  source TEXT NOT NULL DEFAULT 'custom',
  plugin_id TEXT,
  mcp_url TEXT NOT NULL,
  auth_mode TEXT NOT NULL DEFAULT 'always',
  oauth_client TEXT NOT NULL DEFAULT 'dcr',
  connected BOOLEAN NOT NULL DEFAULT false,
  last_check JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slug),
  UNIQUE (user_id, mcp_url)
);
CREATE INDEX IF NOT EXISTS user_connectors_user_idx ON user_connectors (user_id, created_at DESC);
ALTER TABLE user_connectors ADD COLUMN IF NOT EXISTS token_ciphertext TEXT;
ALTER TABLE user_connectors ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE user_connectors ADD COLUMN IF NOT EXISTS token_refresh_ciphertext TEXT;
ALTER TABLE user_connectors ADD COLUMN IF NOT EXISTS oauth_client_id TEXT;
CREATE TABLE IF NOT EXISTS connector_oauth_pending (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  verifier TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret_cipher TEXT,
  resource TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS connector_device_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  connector_id TEXT,
  plugin_id TEXT,
  kind TEXT NOT NULL DEFAULT 'mcp',
  github_device_code TEXT,
  github_interval INTEGER,
  verification_uri TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS connector_device_codes_user_idx ON connector_device_codes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  path TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_skills_user_idx ON user_skills (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS studio_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  model TEXT,
  repo JSONB,
  skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  workspace JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS studio_projects_user_idx ON studio_projects (user_id, updated_at DESC);
ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS workspace JSONB NOT NULL DEFAULT '{}'::jsonb;
`

const blockedEmailsSql = `
CREATE TABLE IF NOT EXISTS blocked_emails (
  email TEXT PRIMARY KEY,
  user_id TEXT,
  reason TEXT NOT NULL DEFAULT 'account_deleted',
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

export async function migrate() {
  if (!hasDatabase() || !auth || !pool) {
    throw new Error('Set DATABASE_URL in .env to a Neon Postgres URL first')
  }

  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
  await pool.query(documentsSql)
  await pool.query(profilesSql)
  await pool.query(profileVerifySql)
  await pool.query(verificationSql)
  await pool.query(filesSql)
  await pool.query(workspaceSql)
  await pool.query(billingSql)
  await pool.query(settingsSql)
  await pool.query(automationsSql)
  await pool.query(accountKeysSql)
  await pool.query(blockedEmailsSql)
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}` || process.argv[1]?.endsWith('migrate.ts')) {
  migrate()
    .then(() => {
      console.log('Soumtok database is ready')
      process.exit(0)
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
