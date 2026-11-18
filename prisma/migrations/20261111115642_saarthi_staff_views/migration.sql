-- Spec §10.1 plumbing for the Saarthi Staff assistant: per-viewer read-only views.
--
-- Saarthi's "own rows" rule filters a table by ONE column equal to the signed-in person's id.
-- The v_* views from *_sarthi_readonly can't say "what this person may see" (v_tasks keeps
-- assignees as an array, v_brands lists CS names, invoices and requests only carry a brand), so
-- each v_my_* view below is `viewer_id` + the matching v_* view's columns, one row per
-- (viewer, visible row). Saarthi always adds `WHERE viewer_id = <signed-in user id>`.
--
-- Viewers are active staff (admin, group_admin, cs, employee). Clients are never viewers, and
-- inactive users see nothing: the CRM signs nobody else in (lib/auth.ts currentUser).
--
-- The sarthi_* helper views mirror lib/queries.ts (teamScope, brandScope, taskScope/canSeeTask,
-- peopleScope) and are NOT granted to sarthi_ro. Postgres views run with their OWNER's rights
-- (security_invoker is off unless set; it isn't set on any view here), so when sarthi_ro reads a
-- v_my_* view, the helpers, the v_* views and the tables underneath are read as the view owner
-- (the role that runs migrations). sarthi_ro itself can read nothing but the granted views.
-- Note: sarthi_ro can still read every viewer's rows; viewer_id is the filter Saarthi applies.
--
-- Concerns are never exposed. If a v_* view's columns change later, drop and recreate the
-- matching v_my_* view (its column list was fixed when it was created).

-- ---------------------------------------------------------------------------------------------
-- Helpers (not granted)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE VIEW sarthi_viewer AS
SELECT u.id, u.role, u.group_id
FROM "user" u
WHERE u.status = 'active' AND u.role IN ('admin', 'group_admin', 'cs', 'employee');

-- teamScope: admin → everyone; group admin → the group's non-client users (just themselves
-- without a group); CS → themselves + the employees reporting to them; employee → themselves.
-- No status filter on members, as in lib/queries.ts.
CREATE OR REPLACE VIEW sarthi_team_scope AS
SELECT v.id AS viewer_id, u.id AS member_id
FROM sarthi_viewer v CROSS JOIN "user" u
WHERE v.role = 'admin'
UNION ALL
SELECT v.id, u.id
FROM sarthi_viewer v JOIN "user" u ON u.group_id = v.group_id
WHERE v.role = 'group_admin' AND u.role <> 'client'
UNION ALL
SELECT v.id, v.id
FROM sarthi_viewer v
WHERE v.role IN ('cs', 'employee') OR (v.role = 'group_admin' AND v.group_id IS NULL)
UNION ALL
SELECT v.id, u.id
FROM sarthi_viewer v JOIN "user" u ON u.reports_to_id = v.id
WHERE v.role = 'cs' AND u.role = 'employee';

-- brandScope: admin → every brand; CS → their brand_cs rows; group admin → brands whose CS
-- (any brand_cs user) sits in their group, none without a group; employee → none.
CREATE OR REPLACE VIEW sarthi_brand_scope AS
SELECT v.id AS viewer_id, b.id AS brand_id
FROM sarthi_viewer v CROSS JOIN brand b
WHERE v.role = 'admin'
UNION ALL
SELECT v.id, bc.brand_id
FROM sarthi_viewer v JOIN brand_cs bc ON bc.user_id = v.id
WHERE v.role = 'cs'
UNION ALL
SELECT v.id, b.id
FROM sarthi_viewer v CROSS JOIN brand b
WHERE v.role = 'group_admin'
  AND EXISTS (SELECT 1 FROM brand_cs bc JOIN "user" m ON m.id = bc.user_id
              WHERE bc.brand_id = b.id AND m.group_id = v.group_id);

-- taskScope / canSeeTask: admin → every task; employee → tasks they're assigned to; CS and group
-- admin → tasks of brands in their brand scope, or whose CS is in their team scope, or with an
-- assignee in their team scope (UNION: a task matching several rules appears once).
CREATE OR REPLACE VIEW sarthi_task_scope AS
SELECT v.id AS viewer_id, t.id AS task_id
FROM sarthi_viewer v CROSS JOIN task t
WHERE v.role = 'admin'
UNION ALL
SELECT v.id, ta.task_id
FROM sarthi_viewer v JOIN task_assignee ta ON ta.user_id = v.id
WHERE v.role = 'employee'
UNION ALL
SELECT x.viewer_id, x.task_id
FROM (
  SELECT v.id AS viewer_id, t.id AS task_id
  FROM sarthi_viewer v
  JOIN sarthi_brand_scope bs ON bs.viewer_id = v.id
  JOIN task t ON t.brand_id = bs.brand_id
  WHERE v.role IN ('cs', 'group_admin')
  UNION
  SELECT v.id, t.id
  FROM sarthi_viewer v
  JOIN sarthi_team_scope tm ON tm.viewer_id = v.id
  JOIN task t ON t.cs_user_id = tm.member_id
  WHERE v.role IN ('cs', 'group_admin')
  UNION
  SELECT v.id, ta.task_id
  FROM sarthi_viewer v
  JOIN sarthi_team_scope tm ON tm.viewer_id = v.id
  JOIN task_assignee ta ON ta.user_id = tm.member_id
  WHERE v.role IN ('cs', 'group_admin')
) x;

-- People whose working day (attendance, EOD lines) a viewer follows: their team scope, active
-- staff only. That is the list app/admin/attendance shows (active staff in teamScope; everyone
-- for the super admin) and, for a CS, themselves + the active employees of "My team"
-- (lib/team-views.ts myTeam); an employee follows only themselves.
CREATE OR REPLACE VIEW sarthi_staff_scope AS
SELECT s.viewer_id, s.member_id
FROM sarthi_team_scope s JOIN "user" m ON m.id = s.member_id
WHERE m.status = 'active' AND m.role IN ('admin', 'group_admin', 'cs', 'employee');

REVOKE ALL ON sarthi_viewer, sarthi_team_scope, sarthi_brand_scope, sarthi_task_scope, sarthi_staff_scope FROM PUBLIC, sarthi_ro;

-- ---------------------------------------------------------------------------------------------
-- Per-viewer data views (granted). security_invoker = false is the Postgres default, spelled out:
-- these views read the helpers and tables with the owner's rights.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_my_tasks WITH (security_invoker = false) AS
SELECT s.viewer_id, t.*
FROM sarthi_task_scope s JOIN v_tasks t ON t.id = s.task_id;

CREATE OR REPLACE VIEW v_my_brands WITH (security_invoker = false) AS
SELECT s.viewer_id, b.*
FROM sarthi_brand_scope s JOIN v_brands b ON b.id = s.brand_id;

-- peopleScope = team scope (admins see every login, as /admin/people does).
CREATE OR REPLACE VIEW v_my_people WITH (security_invoker = false) AS
SELECT s.viewer_id, p.*
FROM sarthi_team_scope s JOIN v_people p ON p.id = s.member_id;

-- Money: the super admin sees every invoice (/admin/money), a CS their brands' (My brands, invoice
-- PDFs). Group admins have no money access, employees none. v_invoices already drops drafts.
CREATE OR REPLACE VIEW v_my_invoices WITH (security_invoker = false) AS
SELECT s.viewer_id, i.*
FROM sarthi_brand_scope s
JOIN sarthi_viewer v ON v.id = s.viewer_id
JOIN v_invoices i ON i.brand_id = s.brand_id
WHERE v.role IN ('admin', 'cs');

-- Work requests of the viewer's brand scope (/admin/requests, /team/requests).
CREATE OR REPLACE VIEW v_my_requests WITH (security_invoker = false) AS
SELECT s.viewer_id, r.*
FROM sarthi_brand_scope s JOIN v_requests r ON r.brand_id = s.brand_id;

-- EOD lines on tasks the viewer can see (the task drawer lists every line on the task), plus the
-- lines of the people they follow (own EOD log; a CS's "My team"). eod_log is unique on
-- (user_id, task_id, date), which is how v_eod rows are matched back.
CREATE OR REPLACE VIEW v_my_eod WITH (security_invoker = false) AS
SELECT k.viewer_id, e.*
FROM (
  SELECT s.viewer_id, l.user_id, l.task_id, l.date
  FROM sarthi_task_scope s JOIN eod_log l ON l.task_id = s.task_id
  UNION
  SELECT p.viewer_id, l.user_id, l.task_id, l.date
  FROM sarthi_staff_scope p JOIN eod_log l ON l.user_id = p.member_id
) k
JOIN v_eod e ON e.user_id = k.user_id AND e.task_id = k.task_id AND e.date = k.date;

-- Attendance days of the people the viewer follows (/admin/attendance, /team/attendance, My team).
CREATE OR REPLACE VIEW v_my_attendance_days WITH (security_invoker = false) AS
SELECT p.viewer_id, a.*
FROM sarthi_staff_scope p JOIN v_attendance_days a ON a.user_id = p.member_id;

COMMENT ON VIEW v_my_tasks IS 'Tasks each staff member can see in the CRM. Filter viewer_id = the signed-in user''s id.';
COMMENT ON VIEW v_my_brands IS 'Brands each staff member can see (admin: all; CS: their brands; group admin: their group''s brands; employees: none). Filter viewer_id = the signed-in user''s id.';
COMMENT ON VIEW v_my_people IS 'People each staff member can see (admin: everyone; group admin: their group; CS: themselves + their reports; employee: themselves). Filter viewer_id = the signed-in user''s id.';
COMMENT ON VIEW v_my_invoices IS 'Sent invoices each staff member can see (admin: all; CS: their brands; group admins and employees: none). Filter viewer_id = the signed-in user''s id.';
COMMENT ON VIEW v_my_requests IS 'Client work requests of the brands each staff member can see. Filter viewer_id = the signed-in user''s id.';
COMMENT ON VIEW v_my_eod IS 'EOD lines each staff member can see: lines on their visible tasks plus their own team''s lines. Filter viewer_id = the signed-in user''s id.';
COMMENT ON VIEW v_my_attendance_days IS 'Attendance days each staff member can see: their own plus their active team''s. Filter viewer_id = the signed-in user''s id.';
COMMENT ON COLUMN v_my_tasks.viewer_id IS 'user.id of the staff member these rows are visible to';
COMMENT ON COLUMN v_my_brands.viewer_id IS 'user.id of the staff member these rows are visible to';
COMMENT ON COLUMN v_my_people.viewer_id IS 'user.id of the staff member these rows are visible to';
COMMENT ON COLUMN v_my_invoices.viewer_id IS 'user.id of the staff member these rows are visible to';
COMMENT ON COLUMN v_my_requests.viewer_id IS 'user.id of the staff member these rows are visible to';
COMMENT ON COLUMN v_my_eod.viewer_id IS 'user.id of the staff member these rows are visible to';
COMMENT ON COLUMN v_my_attendance_days.viewer_id IS 'user.id of the staff member these rows are visible to';

-- Only the per-viewer views are added; the existing v_* grants stay as they are.
GRANT SELECT ON v_my_tasks, v_my_brands, v_my_people, v_my_invoices, v_my_requests, v_my_eod, v_my_attendance_days TO sarthi_ro;
