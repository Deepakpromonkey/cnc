-- Spec §4.7: exactly one start and one done status; at most one of each other semantic flag.
CREATE UNIQUE INDEX task_status_one_start ON task_status ((true)) WHERE is_start;
CREATE UNIQUE INDEX task_status_one_done ON task_status ((true)) WHERE is_done;
CREATE UNIQUE INDEX task_status_one_client_gate ON task_status ((true)) WHERE is_client_gate;
CREATE UNIQUE INDEX task_status_one_review ON task_status ((true)) WHERE is_review;
CREATE UNIQUE INDEX task_status_one_rejected ON task_status ((true)) WHERE is_rejected;
ALTER TABLE task_rating ADD CONSTRAINT task_rating_stars_range CHECK (stars BETWEEN 1 AND 5);
ALTER TABLE task ADD CONSTRAINT task_deadline_after_start CHECK (start_date IS NULL OR deadline_at >= start_date);
-- Append-only audit log.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
