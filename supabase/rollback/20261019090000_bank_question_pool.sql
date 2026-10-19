-- Rollback for 20261019090000_bank_question_pool.sql. The app falls back to batched loading
-- when the function is absent. Run only with separate owner authorization; no data changes.

drop function if exists public.get_bank_question_pool(uuid[], boolean, boolean);
