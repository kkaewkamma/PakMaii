-- Ready to Grow / PakMaii — Phase 6: Features for Spark Hack Season #2
-- Pillars: Identity (ICS & Traceability), Security (Water/Groundwater Bank), Community Resilience (3-year Organic Conversion)

ALTER TABLE plots ADD COLUMN plot_code TEXT;
ALTER TABLE plots ADD COLUMN conversion_year TEXT DEFAULT 'Year 1';
ALTER TABLE plots ADD COLUMN crop_type TEXT DEFAULT 'Jasmine Rice';
ALTER TABLE plots ADD COLUMN water_source_status TEXT DEFAULT 'Normal';

CREATE TABLE IF NOT EXISTS input_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plot_code TEXT NOT NULL,
  farmer_id INTEGER NOT NULL REFERENCES users(id),
  input_name TEXT NOT NULL,
  formula_details TEXT NOT NULL,
  expected_use_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  reviewed_by INTEGER REFERENCES users(id),
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_code TEXT NOT NULL UNIQUE,
  crop_type TEXT NOT NULL,
  linked_plots TEXT NOT NULL,
  total_bags_or_kg TEXT NOT NULL,
  ics_review_status TEXT NOT NULL DEFAULT 'approved',
  story_highlights TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plots_plot_code ON plots(plot_code);
CREATE INDEX IF NOT EXISTS idx_input_requests_status ON input_requests(status);
CREATE INDEX IF NOT EXISTS idx_production_lots_code ON production_lots(lot_code);

