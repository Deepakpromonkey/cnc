-- Spec §10.1: read-only surface for Sarthi (and future agents).
-- Views already apply the client-language mapping and exclude password_hash,
-- concerns (entirely), internal task/project comments and anything confidential.

CREATE OR REPLACE VIEW v_tasks AS
SELECT
  t.id, 'T-' || t.code AS code, t.name, t.description,
  b.id AS brand_id, b.name AS brand,
  p.id AS project_id, p.name AS project,
  tt.name AS title, sv.name AS servicing, t.priority::text AS priority,
  s.name AS status,
  CASE WHEN s.is_start THEN 'Queued'
       WHEN s.is_review THEN 'Internal review'
       WHEN s.is_client_gate THEN 'Your approval'
       WHEN s.is_done THEN 'Done'
       ELSE 'In the works' END AS status_label,
  t.start_date, t.deadline_at,
  (t.deadline_at AT TIME ZONE 'Asia/Kolkata') AS deadline_ist,
  (now() > t.deadline_at AND NOT s.is_done AND NOT s.is_client_gate AND NOT s.is_review) AS is_late,
  coalesce(a.assignee_ids, '{}'::uuid[]) AS assignee_ids,
  coalesce(a.assignees, '{}'::text[]) AS assignees,
  cs.id AS cs_id, trim(cs.first_name || ' ' || cs.last_name) AS cs,
  t.share_with_client, t.sarthi_nudge,
  t.started_at, t.submitted_at, t.completed_at, t.created_at, t.updated_at
FROM task t
JOIN brand b ON b.id = t.brand_id
JOIN project p ON p.id = t.project_id
JOIN task_status s ON s.id = t.status_id
JOIN task_title tt ON tt.id = t.title_id
LEFT JOIN servicing_type sv ON sv.id = t.servicing_type_id
JOIN "user" cs ON cs.id = t.cs_user_id
LEFT JOIN LATERAL (
  SELECT array_agg(u.id ORDER BY ta.is_lead DESC) AS assignee_ids,
         array_agg(trim(u.first_name || ' ' || u.last_name) ORDER BY ta.is_lead DESC) AS assignees
  FROM task_assignee ta JOIN "user" u ON u.id = ta.user_id
  WHERE ta.task_id = t.id
) a ON true;

CREATE OR REPLACE VIEW v_brands AS
SELECT
  b.id, b.name, b.company_name, b.division, b.city, b.state, b.frequency::text AS frequency, b.payment_terms,
  b.official_email, b.whatsapp, b.website, b.instagram, b.poc_name, b.poc_phone, b.gstin, b.since_year, b.status::text AS status,
  b.brand_preferences AS preferences,
  coalesce((SELECT array_agg(trim(u.first_name || ' ' || u.last_name) ORDER BY bc.is_primary DESC)
            FROM brand_cs bc JOIN "user" u ON u.id = bc.user_id WHERE bc.brand_id = b.id), '{}') AS cs,
  coalesce((SELECT array_agg(sw.name) FROM brand_scope bs JOIN scope_of_work sw ON sw.id = bs.scope_of_work_id WHERE bs.brand_id = b.id), '{}') AS scope,
  (SELECT count(*) FROM task t JOIN task_status s ON s.id = t.status_id WHERE t.brand_id = b.id AND NOT s.is_done) AS open_tasks
FROM brand b;

CREATE OR REPLACE VIEW v_people AS
SELECT
  u.id, u.first_name, u.last_name, trim(u.first_name || ' ' || u.last_name) AS name, u.role::text AS role,
  u.brand_id, d.name AS department, u.designation, u.email, u.mobile, u.whatsapp_no, u.status::text AS status, u.last_login_at
FROM "user" u
LEFT JOIN department d ON d.id = u.department_id;

CREATE OR REPLACE VIEW v_invoices AS
SELECT
  i.id, 'INV-' || i.number AS number, i.brand_id, b.name AS brand, i.issue_date, i.due_date,
  i.subtotal_paise, i.gst_rate, i.gst_paise, i.total_paise, i.status::text AS status,
  i.razorpay_short_url AS pay_url, i.sent_at, i.viewed_at, i.paid_at, i.reminders_enabled,
  (SELECT coalesce(sum(p.amount_paise), 0) FROM payment p WHERE p.invoice_id = i.id) AS paid_paise,
  (SELECT count(*) FROM invoice_event e WHERE e.invoice_id = i.id AND e.kind = 'reminder') AS reminders_sent
FROM invoice i JOIN brand b ON b.id = i.brand_id
WHERE i.status <> 'draft';

CREATE OR REPLACE VIEW v_requests AS
SELECT
  r.id, 'WR-' || r.code AS code, r.brand_id, b.name AS brand, p.name AS project, r.subject, r.description,
  r.date, r.needed_by, r.priority::text AS priority, r.status::text AS status, r.channel,
  trim(o.first_name || ' ' || o.last_name) AS owner, r.first_reply_at, r.converted_task_id
FROM work_request r
JOIN brand b ON b.id = r.brand_id
LEFT JOIN project p ON p.id = r.project_id
LEFT JOIN "user" o ON o.id = r.owner_user_id;

CREATE OR REPLACE VIEW v_attendance_days AS
SELECT
  ad.user_id, trim(u.first_name || ' ' || u.last_name) AS name, u.role::text AS role, ad.date,
  (ad.first_login_at AT TIME ZONE 'Asia/Kolkata') AS first_login_ist,
  (ad.last_logout_at AT TIME ZONE 'Asia/Kolkata') AS last_logout_ist,
  ad.hours, ad.state::text AS state, ad.auto_logout
FROM attendance_day ad JOIN "user" u ON u.id = ad.user_id;

CREATE OR REPLACE VIEW v_eod AS
SELECT
  e.user_id, trim(u.first_name || ' ' || u.last_name) AS name, e.task_id, t.name AS task, b.name AS brand,
  e.date, e.remark, e.status_at_time
FROM eod_log e
JOIN "user" u ON u.id = e.user_id
JOIN task t ON t.id = e.task_id
JOIN brand b ON b.id = t.brand_id;

-- Role without login; ops grants LOGIN + password (or a proxy maps to it) at deploy time.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sarthi_ro') THEN
    CREATE ROLE sarthi_ro NOLOGIN;
  END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM sarthi_ro;
GRANT USAGE ON SCHEMA public TO sarthi_ro;
GRANT SELECT ON v_tasks, v_brands, v_people, v_invoices, v_requests, v_attendance_days, v_eod TO sarthi_ro;
