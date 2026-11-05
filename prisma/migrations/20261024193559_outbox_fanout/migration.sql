-- AlterTable
ALTER TABLE "event_outbox" ADD COLUMN     "fanned_out_at" TIMESTAMPTZ,
ADD COLUMN     "notify" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "event_outbox_fanned_out_at_idx" ON "event_outbox"("fanned_out_at");
