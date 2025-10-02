-- Migration 004: Add Service-to-Bin Mapping Infrastructure
-- Creates deterministic mapping tables and columns for revenue categorization

-- 1) Service mapping source of truth
CREATE TABLE IF NOT EXISTS service_mapping (
  id SERIAL PRIMARY KEY,
  service_name TEXT NOT NULL,
  service_type TEXT,
  default_charge NUMERIC,
  revenue_perf_bin TEXT,        -- e.g., 'IV therapy', 'Weight Loss'
  service_volume_bin TEXT,      -- e.g., 'IV Infusions', 'Injections', 'Weight Management', 'Total Hormone Services'
  customer_bin TEXT,            -- 'Member' | 'Non-member Customers' | NULL
  normalized_service_name TEXT GENERATED ALWAYS AS (lower(trim(service_name))) STORED,
  normalized_service_type TEXT GENERATED ALWAYS AS (lower(trim(COALESCE(service_type, '')))) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (normalized_service_name, normalized_service_type)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_service_mapping_normalized
  ON service_mapping(normalized_service_name, normalized_service_type);

-- 2) Unmatched rows captured for ops review
CREATE TABLE IF NOT EXISTS unmapped_services (
  id BIGSERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  file_row JSONB NOT NULL,
  normalized_service_name TEXT,
  normalized_service_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying unmapped by week
CREATE INDEX IF NOT EXISTS idx_unmapped_week ON unmapped_services(week_start);

-- 3) Add bin columns to analytics_data table
ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS revenue_perf_bin TEXT;
ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS service_volume_bin TEXT;
ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS customer_bin TEXT;

-- 4) Mapping metadata table for freshness tracking
CREATE TABLE IF NOT EXISTS mapping_meta (
  id SERIAL PRIMARY KEY,
  mapping_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  loaded_at TIMESTAMPTZ DEFAULT now(),
  source_file TEXT
);

-- 5) Update trigger for service_mapping
CREATE OR REPLACE FUNCTION update_service_mapping_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_service_mapping ON service_mapping;
CREATE TRIGGER trigger_update_service_mapping
    BEFORE UPDATE ON service_mapping
    FOR EACH ROW EXECUTE FUNCTION update_service_mapping_timestamp();

-- Comments for documentation
COMMENT ON TABLE service_mapping IS 'Deterministic service-to-bin mapping loaded from Optimantra Services Export Excel';
COMMENT ON TABLE unmapped_services IS 'Services that could not be matched during import for ops review';
COMMENT ON TABLE mapping_meta IS 'Tracks mapping file freshness and versions';
COMMENT ON COLUMN analytics_data.revenue_perf_bin IS 'Revenue performance categorization from mapping';
COMMENT ON COLUMN analytics_data.service_volume_bin IS 'Service volume categorization from mapping';
COMMENT ON COLUMN analytics_data.customer_bin IS 'Customer type categorization from mapping';
