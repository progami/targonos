-- Hermes (Amazon Solicitations + Buyer Messaging) safety schema
--
-- Hermes is designed around strict guardrails:
--   1) Request-a-Review: never send more than once per order.
--   2) Buyer-Seller Messaging: never send the same message kind more than once per order.
--
-- Key safety properties:
--   • Hard idempotency via UNIQUE (partial) indexes
--   • Concurrency-safe claiming via state transitions (queued -> sending -> sent)
--   • Immutable audit trail via hermes_dispatch_attempts
--
-- NOTE
-- - The Orders API generally returns up to ~2 years of orders. Older orders may be archived
--   and not retrievable through the Orders API.

CREATE TABLE IF NOT EXISTS hermes_dispatches (
  id              TEXT PRIMARY KEY,
  connection_id   TEXT NOT NULL,
  order_id        TEXT NOT NULL,
  marketplace_id  TEXT NOT NULL,

  -- Dispatch type:
  -- - request_review: Solicitations API (Request-a-Review button equivalent)
  -- - buyer_message: Messaging API (Buyer-Seller messages)
  type            TEXT NOT NULL,

  -- For buyer_message only (e.g. confirmDeliveryDetails, confirmOrderDetails, ...)
  message_kind    TEXT,

  state           TEXT NOT NULL DEFAULT 'queued',
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  last_error      TEXT,

  campaign_id     TEXT,
  experiment_id   TEXT,
  variant_id      TEXT,
  template_id     TEXT,

  -- Generic metadata blob for audit/debug:
  -- e.g. { source, policyAnchor, schedule, message: {kind, text, ...} }
  metadata        JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------
-- Schema evolution (safe re-runs)
-- -------------------------------

ALTER TABLE IF EXISTS hermes_dispatches ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS hermes_dispatches ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE IF EXISTS hermes_dispatches ADD COLUMN IF NOT EXISTS experiment_id TEXT;
ALTER TABLE IF EXISTS hermes_dispatches ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE IF EXISTS hermes_dispatches ADD COLUMN IF NOT EXISTS template_id TEXT;
ALTER TABLE IF EXISTS hermes_dispatches ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE IF EXISTS hermes_dispatches ADD COLUMN IF NOT EXISTS message_kind TEXT;

-- Update/replace constraints (when upgrading from older schemas)
ALTER TABLE IF EXISTS hermes_dispatches DROP CONSTRAINT IF EXISTS hermes_dispatch_state_check;
ALTER TABLE IF EXISTS hermes_dispatches
  ADD CONSTRAINT hermes_dispatch_state_check
  CHECK (state IN ('queued','sending','sent','skipped','failed'));

ALTER TABLE IF EXISTS hermes_dispatches DROP CONSTRAINT IF EXISTS hermes_dispatch_type_check;
ALTER TABLE IF EXISTS hermes_dispatches
  ADD CONSTRAINT hermes_dispatch_type_check
  CHECK (type IN ('request_review','buyer_message'));

ALTER TABLE IF EXISTS hermes_dispatches DROP CONSTRAINT IF EXISTS hermes_dispatch_message_kind_check;
ALTER TABLE IF EXISTS hermes_dispatches
  ADD CONSTRAINT hermes_dispatch_message_kind_check
  CHECK (
    (type <> 'buyer_message')
    OR (message_kind IS NOT NULL AND length(trim(message_kind)) > 0)
  );

-- If an old unique constraint exists (v7), drop it.
ALTER TABLE IF EXISTS hermes_dispatches DROP CONSTRAINT IF EXISTS hermes_dispatch_unique_order;

-- Idempotency (HARD safety):
--  • request_review: one per order
--  • buyer_message: one per (order, message_kind)
CREATE UNIQUE INDEX IF NOT EXISTS hermes_dispatches_unique_request_review
  ON hermes_dispatches (connection_id, order_id)
  WHERE type = 'request_review';

CREATE UNIQUE INDEX IF NOT EXISTS hermes_dispatches_unique_buyer_message
  ON hermes_dispatches (connection_id, order_id, message_kind)
  WHERE type = 'buyer_message';

CREATE INDEX IF NOT EXISTS hermes_dispatches_state_scheduled_idx
  ON hermes_dispatches (state, scheduled_at);

CREATE INDEX IF NOT EXISTS hermes_dispatches_expires_idx
  ON hermes_dispatches (expires_at);

CREATE INDEX IF NOT EXISTS hermes_dispatches_type_kind_idx
  ON hermes_dispatches (type, message_kind);


CREATE TABLE IF NOT EXISTS hermes_dispatch_attempts (
  id               TEXT PRIMARY KEY,
  dispatch_id      TEXT NOT NULL REFERENCES hermes_dispatches(id) ON DELETE CASCADE,
  attempt_no       INTEGER NOT NULL,
  status           TEXT NOT NULL,
  http_status      INTEGER,
  spapi_request_id TEXT,
  error_code       TEXT,
  error_message    TEXT,
  response_json    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT hermes_attempt_status_check CHECK (status IN ('sent','ineligible','throttled','failed'))
);

CREATE INDEX IF NOT EXISTS hermes_dispatch_attempts_dispatch_idx
  ON hermes_dispatch_attempts (dispatch_id, created_at);


-- Orders ingest (for backfills + segmentation + analytics)
CREATE TABLE IF NOT EXISTS hermes_orders (
  connection_id          TEXT NOT NULL,
  order_id               TEXT NOT NULL,
  marketplace_id         TEXT NOT NULL,

  purchase_date          TIMESTAMPTZ,
  last_update_date       TIMESTAMPTZ,
  order_status           TEXT,
  fulfillment_channel    TEXT,

  earliest_delivery_date TIMESTAMPTZ,
  latest_delivery_date   TIMESTAMPTZ,
  latest_ship_date       TIMESTAMPTZ,

  raw                   JSONB,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (connection_id, order_id)
);

CREATE INDEX IF NOT EXISTS hermes_orders_imported_idx
  ON hermes_orders (connection_id, imported_at DESC);

CREATE INDEX IF NOT EXISTS hermes_orders_purchase_idx
  ON hermes_orders (connection_id, purchase_date DESC);


-- Manual product-review ingest (user-provided review text per ASIN)
CREATE TABLE IF NOT EXISTS hermes_manual_reviews (
  id                 TEXT PRIMARY KEY,
  connection_id      TEXT NOT NULL,
  marketplace_id     TEXT NOT NULL,
  asin               TEXT NOT NULL,

  source             TEXT NOT NULL DEFAULT 'manual',
  external_review_id TEXT,
  review_date        TIMESTAMPTZ,
  rating             NUMERIC(3,2),
  title              TEXT,
  body               TEXT NOT NULL,
  review_hash        TEXT NOT NULL,
  raw                JSONB,

  imported_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS external_review_id TEXT;
ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS review_date TIMESTAMPTZ;
ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2);
ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS review_hash TEXT;
ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS raw JSONB;
ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE IF EXISTS hermes_manual_reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS hermes_manual_reviews DROP CONSTRAINT IF EXISTS hermes_manual_reviews_rating_check;
ALTER TABLE IF EXISTS hermes_manual_reviews
  ADD CONSTRAINT hermes_manual_reviews_rating_check
  CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5));

CREATE UNIQUE INDEX IF NOT EXISTS hermes_manual_reviews_unique_hash
  ON hermes_manual_reviews (connection_id, marketplace_id, asin, review_hash);

CREATE INDEX IF NOT EXISTS hermes_manual_reviews_lookup_idx
  ON hermes_manual_reviews (connection_id, marketplace_id, asin, imported_at DESC);


-- Customer Feedback API snapshots (ASIN review topics/trends)
CREATE TABLE IF NOT EXISTS hermes_asin_review_insights (
  connection_id               TEXT NOT NULL,
  marketplace_id              TEXT NOT NULL,
  asin                        TEXT NOT NULL,

  item_name                   TEXT,
  country_code                TEXT,
  topics_mentions             JSONB,
  topics_star_rating_impact   JSONB,
  review_trends               JSONB,
  topics_date_start           TIMESTAMPTZ,
  topics_date_end             TIMESTAMPTZ,
  trends_date_start           TIMESTAMPTZ,
  trends_date_end             TIMESTAMPTZ,
  last_sync_error             TEXT,
  last_sync_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (connection_id, marketplace_id, asin)
);

ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS topics_mentions JSONB;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS topics_star_rating_impact JSONB;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS review_trends JSONB;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS topics_date_start TIMESTAMPTZ;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS topics_date_end TIMESTAMPTZ;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS trends_date_start TIMESTAMPTZ;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS trends_date_end TIMESTAMPTZ;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE IF EXISTS hermes_asin_review_insights ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS hermes_asin_review_insights_sync_idx
  ON hermes_asin_review_insights (connection_id, last_sync_at DESC);


-- Job state (lightweight KV) for background jobs like hourly Orders sync
CREATE TABLE IF NOT EXISTS hermes_job_state (
  connection_id TEXT NOT NULL,
  key           TEXT NOT NULL,
  value         TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (connection_id, key)
);

CREATE INDEX IF NOT EXISTS hermes_job_state_updated_idx
  ON hermes_job_state (connection_id, updated_at DESC);


-- Campaigns
CREATE TABLE IF NOT EXISTS hermes_campaigns (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  channel             TEXT NOT NULL DEFAULT 'amazon_solicitations',
  status              TEXT NOT NULL DEFAULT 'draft',
  connection_id       TEXT NOT NULL,
  schedule            JSONB NOT NULL DEFAULT '{}',
  control_holdout_pct INTEGER NOT NULL DEFAULT 5,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS hermes_campaigns DROP CONSTRAINT IF EXISTS hermes_campaign_status_check;
ALTER TABLE IF EXISTS hermes_campaigns
  ADD CONSTRAINT hermes_campaign_status_check
  CHECK (status IN ('draft','live','paused','archived'));

CREATE INDEX IF NOT EXISTS hermes_campaigns_status_idx
  ON hermes_campaigns (status);

CREATE INDEX IF NOT EXISTS hermes_campaigns_connection_idx
  ON hermes_campaigns (connection_id);


-- Experiments
CREATE TABLE IF NOT EXISTS hermes_experiments (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  campaign_id     TEXT NOT NULL,
  allocations     JSONB NOT NULL DEFAULT '[]',
  primary_metric  TEXT NOT NULL DEFAULT 'amazon_review_submitted_rate',
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS hermes_experiments DROP CONSTRAINT IF EXISTS hermes_experiment_status_check;
ALTER TABLE IF EXISTS hermes_experiments
  ADD CONSTRAINT hermes_experiment_status_check
  CHECK (status IN ('draft','running','stopped'));

CREATE INDEX IF NOT EXISTS hermes_experiments_campaign_idx
  ON hermes_experiments (campaign_id);
