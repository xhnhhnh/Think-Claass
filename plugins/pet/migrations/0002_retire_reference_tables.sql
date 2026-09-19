-- Retire the P3 reference tables.
--
-- `0001_init` created `p_pet_pets` and `p_pet_praise_log` for a pet model that never existed
-- in the product: a pet with a `name`, an `element` and a `stage`. The real pet table is
-- `pets` (adopted by this plugin as of P4.3b.6, renamed to `p_pet_*` by P7), and nothing ever
-- read these two - both are empty in the developer database.
--
-- They are dropped by a NEW migration rather than by editing `0001_init`, for the reason
-- `api/schema/paymentTables.ts` documents: an applied migration's checksum IS its SQL, so
-- editing it makes `runMigrations` refuse to start every database that already applied it -
-- including the deployed one. `0001_init` stays declared so the ledger of an existing database
-- still resolves; on a fresh database it creates two tables that this migration then removes,
-- which is the cost of never rewriting migration history.
--
-- Dropping is allowed because the tables carry this plugin's own `p_pet_` prefix; the
-- migration runner refuses DDL against anything else.

DROP TABLE IF EXISTS p_pet_pets;
DROP TABLE IF EXISTS p_pet_praise_log;
