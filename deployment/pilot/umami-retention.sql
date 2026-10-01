-- Dedicated analytics database only. The daily schedule adds up to one day.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
DELETE FROM event_data WHERE created_at < now() - interval '90 days';
DELETE FROM website_event WHERE created_at < now() - interval '90 days';
DELETE FROM session_data WHERE created_at < now() - interval '90 days';
DELETE FROM session_link WHERE created_at < now() - interval '90 days';
DELETE FROM session s
WHERE s.created_at < now() - interval '90 days'
  AND NOT EXISTS (SELECT 1 FROM website_event e WHERE e.session_id = s.session_id)
  AND NOT EXISTS (SELECT 1 FROM session_data d WHERE d.session_id = s.session_id);
COMMIT;
