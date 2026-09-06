ALTER TABLE "generation_jobs" ADD COLUMN "lease_owner" TEXT;
ALTER TABLE "generation_jobs" ADD COLUMN "lease_expires_at" TIMESTAMP(3);
