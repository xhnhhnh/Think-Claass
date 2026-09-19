-- pet plugin schema.
--
-- Owned entirely by this plugin: the `p_pet_` prefix is enforced by the migration
-- runner, which refuses DDL against any table the plugin does not own.
--
-- Note the deliberate absence of a foreign key to `students`. That table belongs to
-- the classroom plugin, and a cross-owner foreign key would be exactly the schema
-- coupling the plugin boundary exists to prevent. Referential integrity for
-- `student_id` is the classroom port's job.

CREATE TABLE IF NOT EXISTS p_pet_pets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  element      TEXT    NOT NULL DEFAULT 'normal',
  level        INTEGER NOT NULL DEFAULT 1,
  experience   INTEGER NOT NULL DEFAULT 0,
  stage        INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_p_pet_pets_student ON p_pet_pets (student_id);

-- Pet dialogue is owned here too: it is pet presentation, not classroom data.
CREATE TABLE IF NOT EXISTS p_pet_praise_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id      INTEGER NOT NULL,
  actor_id    INTEGER NOT NULL,
  message     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_p_pet_praise_pet ON p_pet_praise_log (pet_id);
