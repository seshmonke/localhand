ALTER TABLE "seller_payment_accounts" ALTER COLUMN "status" SET DEFAULT 'error';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reconcile_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "payments_pending_reconcile_idx" ON "payments" USING btree ("created_at") WHERE "payments"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reconcile_attempts_check" CHECK ("payments"."reconcile_attempts" >= 0);