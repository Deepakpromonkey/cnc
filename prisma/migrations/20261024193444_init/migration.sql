-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'cs', 'employee', 'client');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('female', 'male', 'other');

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('neutral', 'crimson', 'gold', 'muted');

-- CreateEnum
CREATE TYPE "FlagColour" AS ENUM ('gold', 'crimson', 'cream', 'muted');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('monthly_retainer', 'quarterly', 'yearly', 'project_based');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('upload', 'link');

-- CreateEnum
CREATE TYPE "RaterKind" AS ENUM ('client', 'cs');

-- CreateEnum
CREATE TYPE "AttendanceState" AS ENUM ('present', 'late', 'absent', 'leave', 'holiday', 'weekend');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('casual', 'sick', 'half_day', 'wfh');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ConcernCategory" AS ENUM ('workload', 'client_behaviour', 'process', 'team', 'leave', 'equipment', 'workplace', 'pay', 'other');

-- CreateEnum
CREATE TYPE "ConcernStatus" AS ENUM ('open', 'in_discussion', 'resolved');

-- CreateEnum
CREATE TYPE "FlagTargetRole" AS ENUM ('employee', 'cs');

-- CreateEnum
CREATE TYPE "ScoreParameter" AS ENUM ('on_time', 'review_pass', 'cs_rating', 'eod', 'attendance', 'client_approval', 'throughput', 'rework');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('new', 'answered', 'on_hold', 'converted');

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('announcement', 'holiday');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'viewed', 'paid', 'overdue', 'void');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('upi', 'card', 'netbanking', 'wallet', 'offline');

-- CreateEnum
CREATE TYPE "InvoiceEventKind" AS ENUM ('created', 'sent', 'viewed', 'reminder', 'paid', 'voided');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('brand_logo', 'user_photo', 'task', 'project', 'request', 'comment', 'concern', 'announcement', 'company_logo', 'backdrop');

-- CreateEnum
CREATE TYPE "NotificationModule" AS ENUM ('task', 'approval', 'request', 'concern', 'flag', 'invoice', 'announcement', 'attendance', 'sarthi', 'system');

-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('user', 'system', 'agent');

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "gstin" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "portal_url" TEXT,
    "logo_file_id" UUID,
    "studio_hours_start" TEXT NOT NULL DEFAULT '09:30',
    "studio_hours_end" TEXT NOT NULL DEFAULT '19:30',
    "late_login_after" TEXT NOT NULL DEFAULT '10:30',
    "working_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "login_id" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "Role" NOT NULL,
    "brand_id" UUID,
    "department_id" UUID,
    "designation" TEXT,
    "photo_file_id" UUID,
    "gender" "Gender",
    "dob" DATE,
    "mobile" TEXT,
    "whatsapp_no" TEXT,
    "personal_email" TEXT,
    "personal_contact" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "country" TEXT DEFAULT 'India',
    "linkedin" TEXT,
    "facebook" TEXT,
    "instagram" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "invited_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "legacy_row_id" TEXT,
    "legacy_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impersonator_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_of_work" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "default_rate_paise" BIGINT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "scope_of_work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_title" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicing_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_description" TEXT,
    "description" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "servicing_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_status" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tone" "Tone" NOT NULL DEFAULT 'neutral',
    "order" INTEGER NOT NULL,
    "is_start" BOOLEAN NOT NULL DEFAULT false,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "is_client_gate" BOOLEAN NOT NULL DEFAULT false,
    "is_review" BOOLEAN NOT NULL DEFAULT false,
    "is_rejected" BOOLEAN NOT NULL DEFAULT false,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flag_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "colour" "FlagColour" NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "flag_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "division" TEXT,
    "logo_file_id" UUID,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "country" TEXT DEFAULT 'India',
    "frequency" "Frequency" NOT NULL DEFAULT 'monthly_retainer',
    "payment_terms" TEXT,
    "official_email" TEXT,
    "whatsapp" TEXT,
    "website" TEXT,
    "twitter" TEXT,
    "linkedin" TEXT,
    "facebook" TEXT,
    "instagram" TEXT,
    "other_social_link" TEXT,
    "poc_name" TEXT,
    "poc_phone" TEXT,
    "vat_number" TEXT,
    "gstin" TEXT,
    "additional_information" TEXT,
    "since_year" INTEGER,
    "fee_note" TEXT,
    "brand_preferences" JSONB NOT NULL DEFAULT '{}',
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "legacy_row_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_cs" (
    "brand_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "brand_cs_pkey" PRIMARY KEY ("brand_id","user_id")
);

-- CreateTable
CREATE TABLE "brand_scope" (
    "brand_id" UUID NOT NULL,
    "scope_of_work_id" UUID NOT NULL,

    CONSTRAINT "brand_scope_pkey" PRIMARY KEY ("brand_id","scope_of_work_id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "brand_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand_poc" TEXT,
    "poc_phone" TEXT,
    "type" TEXT,
    "sub_type" TEXT,
    "description" TEXT,
    "start_date" DATE,
    "deadline" DATE,
    "reference_link_1" TEXT,
    "reference_link_2" TEXT,
    "reference_link_3" TEXT,
    "payment_terms" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "status_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "legacy_row_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_scope" (
    "project_id" UUID NOT NULL,
    "scope_of_work_id" UUID NOT NULL,

    CONSTRAINT "project_scope_pkey" PRIMARY KEY ("project_id","scope_of_work_id")
);

-- CreateTable
CREATE TABLE "project_comment" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "file_id" UUID,
    "visible_to_client" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "brand_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "servicing_type_id" UUID,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "start_date" DATE,
    "deadline_at" TIMESTAMPTZ NOT NULL,
    "deadline_was_text" BOOLEAN NOT NULL DEFAULT false,
    "status_id" UUID NOT NULL,
    "cs_user_id" UUID NOT NULL,
    "created_by" UUID,
    "started_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "share_with_client" BOOLEAN NOT NULL DEFAULT true,
    "sarthi_nudge" BOOLEAN NOT NULL DEFAULT true,
    "source_request_id" UUID,
    "legacy_row_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignee" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_id" UUID,
    "start_date" DATE,
    "end_date" DATE,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "task_assignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachment" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "file_id" UUID,
    "url" TEXT,
    "label" TEXT,
    "uploaded_by" UUID,
    "visible_to_client" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_status_history" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "from_status_id" UUID,
    "to_status_id" UUID NOT NULL,
    "by_user_id" UUID,
    "note" TEXT,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comment" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'comment',
    "file_id" UUID,
    "visible_to_client" BOOLEAN NOT NULL DEFAULT false,
    "mentions" UUID[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_log" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "remark" TEXT NOT NULL,
    "status_at_time" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eod_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_rating" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "rated_by_user_id" UUID NOT NULL,
    "rater_kind" "RaterKind" NOT NULL,
    "stars" INTEGER NOT NULL,
    "review" TEXT,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "login_at" TIMESTAMPTZ NOT NULL,
    "logout_at" TIMESTAMPTZ,
    "auto_logout" BOOLEAN NOT NULL DEFAULT false,
    "session_id" UUID,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "attendance_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_day" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "first_login_at" TIMESTAMPTZ,
    "last_logout_at" TIMESTAMPTZ,
    "hours" DECIMAL(5,2),
    "auto_logout" BOOLEAN NOT NULL DEFAULT false,
    "state" "AttendanceState" NOT NULL,
    "remark" TEXT,
    "remark_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attendance_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "type" "LeaveType" NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concern" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "raised_by_user_id" UUID NOT NULL,
    "category" "ConcernCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "file_id" UUID,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "owner_user_id" UUID NOT NULL,
    "sla_hours" INTEGER NOT NULL DEFAULT 24,
    "status" "ConcernStatus" NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMPTZ,
    "logged_on_behalf_by" UUID,
    "legacy_row_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "concern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concern_reply" (
    "id" UUID NOT NULL,
    "concern_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concern_reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flag" (
    "id" UUID NOT NULL,
    "flag_type_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "target_role" "FlagTargetRole" NOT NULL,
    "given_by_user_id" UUID NOT NULL,
    "brand_id" UUID,
    "project_id" UUID,
    "task_id" UUID,
    "subject" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "points_applied" INTEGER NOT NULL,
    "month" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_score" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "rank_in_dept" INTEGER,
    "breakdown" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_weight" (
    "parameter" "ScoreParameter" NOT NULL,
    "weight" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "scoring_weight_pkey" PRIMARY KEY ("parameter")
);

-- CreateTable
CREATE TABLE "work_request" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "brand_id" UUID NOT NULL,
    "project_id" UUID,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference_link" TEXT,
    "needed_by" DATE,
    "poc_name" TEXT,
    "poc_contact" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "status" "RequestStatus" NOT NULL DEFAULT 'new',
    "owner_user_id" UUID,
    "converted_task_id" UUID,
    "raised_by_user_id" UUID,
    "channel" TEXT NOT NULL DEFAULT 'portal',
    "first_reply_at" TIMESTAMPTZ,
    "legacy_row_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "work_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_request_attachment" (
    "id" UUID NOT NULL,
    "work_request_id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "file_id" UUID,
    "url" TEXT,
    "label" TEXT,

    CONSTRAINT "work_request_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_request_reply" (
    "id" UUID NOT NULL,
    "work_request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visible_to_client" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "work_request_reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "type" "AnnouncementType" NOT NULL,
    "subject" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "message" TEXT,
    "show_to_clients" BOOLEAN NOT NULL DEFAULT false,
    "broadcast" BOOLEAN NOT NULL DEFAULT false,
    "image_file_id" UUID,
    "posted_by" UUID,
    "archived_at" TIMESTAMPTZ,
    "legacy_row_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "brand_id" UUID NOT NULL,
    "issue_date" DATE,
    "due_date" DATE,
    "subtotal_paise" BIGINT NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "gst_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "notes" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "razorpay_link_id" TEXT,
    "razorpay_short_url" TEXT,
    "sent_at" TIMESTAMPTZ,
    "viewed_at" TIMESTAMPTZ,
    "paid_at" TIMESTAMPTZ,
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_item" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_paise" BIGINT NOT NULL,
    "amount_paise" BIGINT NOT NULL,

    CONSTRAINT "invoice_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "razorpay_payment_id" TEXT,
    "razorpay_signature_ok" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" UUID,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_event" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" "InvoiceEventKind" NOT NULL,
    "by_user_id" UUID,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "thumb_320_key" TEXT,
    "thumb_1280_key" TEXT,
    "uploaded_by" UUID,
    "purpose" "FilePurpose" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "module" "NotificationModule" NOT NULL,
    "event" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMPTZ,
    "emitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_kind" "ActorKind" NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_outbox" (
    "id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "delivered_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_access" (
    "id" UUID NOT NULL,
    "agent_name" TEXT NOT NULL,
    "db_role" TEXT NOT NULL,
    "allowed_queries" JSONB NOT NULL,
    "webhook_url" TEXT,
    "webhook_secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agent_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_login_id_key" ON "user"("login_id");

-- CreateIndex
CREATE INDEX "user_role_status_idx" ON "user"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_hash_key" ON "password_reset"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "department_name_key" ON "department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "scope_of_work_name_key" ON "scope_of_work"("name");

-- CreateIndex
CREATE UNIQUE INDEX "task_title_name_key" ON "task_title"("name");

-- CreateIndex
CREATE UNIQUE INDEX "servicing_type_name_key" ON "servicing_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "task_status_name_key" ON "task_status"("name");

-- CreateIndex
CREATE UNIQUE INDEX "flag_type_name_key" ON "flag_type"("name");

-- CreateIndex
CREATE INDEX "brand_status_idx" ON "brand"("status");

-- CreateIndex
CREATE UNIQUE INDEX "project_code_key" ON "project"("code");

-- CreateIndex
CREATE INDEX "project_brand_id_idx" ON "project"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_code_key" ON "task"("code");

-- CreateIndex
CREATE INDEX "task_brand_id_status_id_idx" ON "task"("brand_id", "status_id");

-- CreateIndex
CREATE INDEX "task_deadline_at_idx" ON "task"("deadline_at");

-- CreateIndex
CREATE INDEX "task_assignee_user_id_idx" ON "task_assignee"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignee_task_id_user_id_key" ON "task_assignee"("task_id", "user_id");

-- CreateIndex
CREATE INDEX "task_status_history_task_id_at_idx" ON "task_status_history"("task_id", "at");

-- CreateIndex
CREATE INDEX "eod_log_user_id_date_idx" ON "eod_log"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "eod_log_user_id_task_id_date_key" ON "eod_log"("user_id", "task_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "task_rating_task_id_rater_kind_key" ON "task_rating"("task_id", "rater_kind");

-- CreateIndex
CREATE INDEX "attendance_session_user_id_login_at_idx" ON "attendance_session"("user_id", "login_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_day_user_id_date_key" ON "attendance_day"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "concern_code_key" ON "concern"("code");

-- CreateIndex
CREATE INDEX "flag_target_user_id_month_idx" ON "flag"("target_user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "performance_score_user_id_month_key" ON "performance_score"("user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "work_request_code_key" ON "work_request"("code");

-- CreateIndex
CREATE INDEX "work_request_brand_id_status_idx" ON "work_request"("brand_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_code_key" ON "announcement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_number_key" ON "invoice"("number");

-- CreateIndex
CREATE INDEX "invoice_brand_id_status_idx" ON "invoice"("brand_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_razorpay_payment_id_key" ON "payment"("razorpay_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_storage_key_key" ON "file"("storage_key");

-- CreateIndex
CREATE INDEX "notification_user_id_read_at_idx" ON "notification"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_at_idx" ON "audit_log"("entity_type", "entity_id", "at");

-- CreateIndex
CREATE INDEX "event_outbox_delivered_at_idx" ON "event_outbox"("delivered_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_access_agent_name_key" ON "agent_access"("agent_name");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand" ADD CONSTRAINT "brand_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_cs" ADD CONSTRAINT "brand_cs_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_cs" ADD CONSTRAINT "brand_cs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_scope" ADD CONSTRAINT "brand_scope_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_scope" ADD CONSTRAINT "brand_scope_scope_of_work_id_fkey" FOREIGN KEY ("scope_of_work_id") REFERENCES "scope_of_work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "task_status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_scope" ADD CONSTRAINT "project_scope_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_scope" ADD CONSTRAINT "project_scope_scope_of_work_id_fkey" FOREIGN KEY ("scope_of_work_id") REFERENCES "scope_of_work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "task_title"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_servicing_type_id_fkey" FOREIGN KEY ("servicing_type_id") REFERENCES "servicing_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "task_status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_cs_user_id_fkey" FOREIGN KEY ("cs_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachment" ADD CONSTRAINT "task_attachment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachment" ADD CONSTRAINT "task_attachment_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_history" ADD CONSTRAINT "task_status_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_history" ADD CONSTRAINT "task_status_history_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "task_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_history" ADD CONSTRAINT "task_status_history_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "task_status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_history" ADD CONSTRAINT "task_status_history_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_log" ADD CONSTRAINT "eod_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_log" ADD CONSTRAINT "eod_log_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_rating" ADD CONSTRAINT "task_rating_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_rating" ADD CONSTRAINT "task_rating_rated_by_user_id_fkey" FOREIGN KEY ("rated_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_session" ADD CONSTRAINT "attendance_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_day" ADD CONSTRAINT "attendance_day_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concern" ADD CONSTRAINT "concern_raised_by_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concern" ADD CONSTRAINT "concern_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concern" ADD CONSTRAINT "concern_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concern_reply" ADD CONSTRAINT "concern_reply_concern_id_fkey" FOREIGN KEY ("concern_id") REFERENCES "concern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concern_reply" ADD CONSTRAINT "concern_reply_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_flag_type_id_fkey" FOREIGN KEY ("flag_type_id") REFERENCES "flag_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_given_by_user_id_fkey" FOREIGN KEY ("given_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_score" ADD CONSTRAINT "performance_score_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_request" ADD CONSTRAINT "work_request_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_request" ADD CONSTRAINT "work_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_request" ADD CONSTRAINT "work_request_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_request" ADD CONSTRAINT "work_request_raised_by_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_request" ADD CONSTRAINT "work_request_converted_task_id_fkey" FOREIGN KEY ("converted_task_id") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_request_attachment" ADD CONSTRAINT "work_request_attachment_work_request_id_fkey" FOREIGN KEY ("work_request_id") REFERENCES "work_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_request_attachment" ADD CONSTRAINT "work_request_attachment_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_request_reply" ADD CONSTRAINT "work_request_reply_work_request_id_fkey" FOREIGN KEY ("work_request_id") REFERENCES "work_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_request_reply" ADD CONSTRAINT "work_request_reply_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_event" ADD CONSTRAINT "invoice_event_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
