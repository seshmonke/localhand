DO $$ BEGIN
	CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'canceled', 'failed', 'manual_review');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."seller_payment_account_status" AS ENUM('active', 'superseded', 'disabled', 'error');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'payment_pending';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'paid';--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"seller_account_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_kopecks" bigint NOT NULL,
	"currency" char(3) DEFAULT 'RUB' NOT NULL,
	"confirmation_url" text,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"reconcile_attempts" smallint DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	CONSTRAINT "payments_order_id_idempotency_key_unique" UNIQUE("order_id","idempotency_key"),
	CONSTRAINT "payments_amount_kopecks_check" CHECK ("payments"."amount_kopecks" >= 0),
	CONSTRAINT "payments_currency_check" CHECK ("payments"."currency" = 'RUB'),
	CONSTRAINT "payments_reconcile_attempts_check" CHECK ("payments"."reconcile_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "seller_payment_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"token_ciphertext" "bytea" NOT NULL,
	"token_key_version" smallint NOT NULL,
	"status" "seller_payment_account_status" DEFAULT 'error' NOT NULL,
	"expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_payment_accounts_token_key_version_check" CHECK ("seller_payment_accounts"."token_key_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_seller_account_id_seller_payment_accounts_id_fk" FOREIGN KEY ("seller_account_id") REFERENCES "public"."seller_payment_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payment_accounts" ADD CONSTRAINT "seller_payment_accounts_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_id_active_unique" ON "payments" USING btree ("order_id") WHERE "payments"."status" IN ('pending', 'manual_review');--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_id_unique" ON "payments" USING btree ("provider_payment_id") WHERE "payments"."provider_payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_order_id_created_at_idx" ON "payments" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_seller_account_id_idx" ON "payments" USING btree ("seller_account_id");--> statement-breakpoint
CREATE INDEX "payments_pending_reconcile_idx" ON "payments" USING btree ("created_at") WHERE "payments"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "seller_payment_accounts_seller_id_active_unique" ON "seller_payment_accounts" USING btree ("seller_id") WHERE "seller_payment_accounts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "seller_payment_accounts_seller_id_connected_at_idx" ON "seller_payment_accounts" USING btree ("seller_id","connected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "seller_payment_accounts_provider_account_idx" ON "seller_payment_accounts" USING btree ("provider","provider_account_id");