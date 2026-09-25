import type { Migration } from '@thinkclass/kernel';

export const incentivePolicyMigration: Migration = {
  id: '0000e_incentive_policy',
  owner: 'classroom',
  up: `
    CREATE TABLE IF NOT EXISTS class_incentive_policies (
      class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
      school_stage TEXT NOT NULL DEFAULT 'general' CHECK (school_stage IN ('general','primary','middle','high')),
      parent_bonus_percent INTEGER NOT NULL DEFAULT 0 CHECK (parent_bonus_percent BETWEEN 0 AND 20 AND parent_bonus_percent % 5 = 0),
      team_rankings_visible INTEGER NOT NULL DEFAULT 1 CHECK (team_rankings_visible IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS point_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      record_id INTEGER REFERENCES records(id) ON DELETE SET NULL,
      request_id TEXT,
      source TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('growth','collaboration','competition','participation','balance')),
      rule_version INTEGER NOT NULL DEFAULT 1,
      growth_delta INTEGER NOT NULL DEFAULT 0,
      credits_delta INTEGER NOT NULL DEFAULT 0,
      participation_delta INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS idx_point_events_student_category ON point_events(student_id, category, created_at);
    CREATE INDEX IF NOT EXISTS idx_point_events_source_day ON point_events(student_id, source, created_at);
  `,
};
