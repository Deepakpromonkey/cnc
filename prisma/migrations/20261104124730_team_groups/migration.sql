-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'group_admin';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "reports_to_id" UUID;

-- CreateTable
CREATE TABLE "team_group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "team_group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_group_name_key" ON "team_group"("name");

-- CreateIndex
CREATE INDEX "user_group_id_idx" ON "user"("group_id");

-- CreateIndex
CREATE INDEX "user_reports_to_id_idx" ON "user"("reports_to_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "team_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
