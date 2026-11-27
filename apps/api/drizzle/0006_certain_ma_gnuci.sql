CREATE TYPE "public"."delivery_status" AS ENUM('quoted', 'created', 'in_transit', 'delivered', 'canceled', 'manual', 'failed');--> statement-breakpoint
CREATE TABLE "delivery_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" integer NOT NULL,
	"status_code" text NOT NULL,
	"status_name" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_events_delivery_status_occurred_unique" UNIQUE("delivery_id","status_code","occurred_at")
);
--> statement-breakpoint
CREATE TABLE "order_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"provider" text NOT NULL,
	"status" "delivery_status" DEFAULT 'quoted' NOT NULL,
	"city_code" integer NOT NULL,
	"city_name" text NOT NULL,
	"point_code" text NOT NULL,
	"point_address" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"provider_tariff_code" text,
	"tariff_name" text,
	"price_kopecks" bigint NOT NULL,
	"period_min" smallint,
	"period_max" smallint,
	"provider_order_id" text,
	"provider_number" text,
	"carrier" text,
	"track_number" text,
	"last_status_code" text,
	"last_status_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_deliveries_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "order_deliveries_price_kopecks_check" CHECK ("order_deliveries"."price_kopecks" >= 0),
	CONSTRAINT "order_deliveries_period_min_check" CHECK ("order_deliveries"."period_min" IS NULL OR "order_deliveries"."period_min" >= 0),
	CONSTRAINT "order_deliveries_period_max_check" CHECK ("order_deliveries"."period_max" IS NULL OR "order_deliveries"."period_max" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_kopecks" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight_g" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length_cm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "width_cm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "cdek_city_code" integer;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "cdek_city_name" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "cdek_shipment_point" text;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_delivery_id_order_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."order_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_events_delivery_id_occurred_at_idx" ON "delivery_events" USING btree ("delivery_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_deliveries_provider_order_id_unique" ON "order_deliveries" USING btree ("provider_order_id") WHERE "order_deliveries"."provider_order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "order_deliveries_provider_number_unique" ON "order_deliveries" USING btree ("provider_number") WHERE "order_deliveries"."provider_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "order_deliveries_status_updated_at_idx" ON "order_deliveries" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_kopecks_check" CHECK ("orders"."delivery_kopecks" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_weight_g_check" CHECK ("products"."weight_g" IS NULL OR "products"."weight_g" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_length_cm_check" CHECK ("products"."length_cm" IS NULL OR "products"."length_cm" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_width_cm_check" CHECK ("products"."width_cm" IS NULL OR "products"."width_cm" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_height_cm_check" CHECK ("products"."height_cm" IS NULL OR "products"."height_cm" > 0);