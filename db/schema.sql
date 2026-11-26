-- Production data model (PostgreSQL). The demo loads the same shapes from CSV into memory (server/engine/store.ts).
-- Swap Store for a repository that runs the aggregate queries below; the risk engine stays unchanged.

CREATE TABLE districts (district_id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE blocks    (block_id SERIAL PRIMARY KEY, district_id INT NOT NULL REFERENCES districts, name TEXT UNIQUE NOT NULL);
CREATE TABLE schools   (school_id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, block_id INT NOT NULL REFERENCES blocks);

-- One row per school per reporting month (grain of the survey).
CREATE TABLE school_responses (
  response_id BIGSERIAL PRIMARY KEY,
  school_id INT NOT NULL REFERENCES schools,
  reporting_month CHAR(7) NOT NULL CHECK (reporting_month ~ '^\d{4}-\d{2}$'),
  submitted_at TIMESTAMPTZ,
  pbl_conducted BOOLEAN NOT NULL,
  evidence_submitted BOOLEAN NOT NULL CHECK (NOT evidence_submitted OR pbl_conducted),
  declared_classes SMALLINT[] NOT NULL DEFAULT '{}',
  declared_subjects TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (school_id, reporting_month)
);
-- Long format keeps grade/subject filters a simple WHERE clause.
CREATE TABLE response_class_metrics (
  response_id BIGINT NOT NULL REFERENCES school_responses ON DELETE CASCADE,
  grade SMALLINT NOT NULL CHECK (grade BETWEEN 6 AND 8),
  subject TEXT NOT NULL CHECK (subject IN ('Science','Math')),
  enrolled INT NOT NULL CHECK (enrolled >= 0),
  avg_attendance INT NOT NULL CHECK (avg_attendance >= 0),
  PRIMARY KEY (response_id, grade, subject)
);
CREATE INDEX ON school_responses (reporting_month);

CREATE TABLE grants (grant_id TEXT PRIMARY KEY, donor TEXT NOT NULL, name TEXT NOT NULL, period_start DATE, period_end DATE);
CREATE TABLE grant_districts (grant_id TEXT REFERENCES grants, district_id INT REFERENCES districts, PRIMARY KEY (grant_id, district_id));
CREATE TABLE grant_finance (grant_id TEXT REFERENCES grants, reporting_month CHAR(7), budget_line TEXT, approved_units NUMERIC, monthly_units NUMERIC, cumulative_units NUMERIC, note TEXT, PRIMARY KEY (grant_id, reporting_month, budget_line));
CREATE TABLE grant_reports (grant_id TEXT REFERENCES grants, reporting_month CHAR(7), due_date DATE, status TEXT, milestone_summary TEXT, PRIMARY KEY (grant_id, reporting_month));
CREATE TABLE evidence_assets (record_id TEXT PRIMARY KEY, grant_id TEXT REFERENCES grants, reporting_month CHAR(7), record_type TEXT, district TEXT, title TEXT, caption TEXT, storage_path TEXT, usage_note TEXT);

CREATE TABLE actions (action_id TEXT PRIMARY KEY, reporting_month CHAR(7), title TEXT, owner_role TEXT, priority TEXT, due_date DATE, status TEXT DEFAULT 'Open', linked_metric JSONB, scope JSONB, updated_at TIMESTAMPTZ DEFAULT now());

-- Example: district aggregate for a month (the engine's attendance definition: sum(att) / (2 * sum(enrolled per grade)))
-- SELECT d.name,
--        count(*) FILTER (WHERE r.pbl_conducted)::float / count(DISTINCT r.response_id) AS participation,
--        sum(m.avg_attendance)::float / nullif(sum(m.enrolled), 0) AS attendance
-- FROM school_responses r JOIN schools s USING (school_id) JOIN blocks b USING (block_id) JOIN districts d USING (district_id)
-- JOIN response_class_metrics m USING (response_id) WHERE r.reporting_month = '2025-09' GROUP BY d.name;
