ALTER TABLE "Project"
    ADD COLUMN "deadline" TEXT,
    ADD COLUMN "plan" JSONB;

ALTER TABLE "Milestone"
    ADD COLUMN "deliverables" JSONB,
    ADD COLUMN "estimatedDays" INTEGER;
