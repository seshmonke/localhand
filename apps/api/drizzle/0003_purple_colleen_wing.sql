CREATE TYPE "public"."order_status" AS ENUM('new');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer,
	"name" text NOT NULL,
	"price_kopecks" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "order_items_price_kopecks_check" CHECK ("order_items"."price_kopecks" >= 0),
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" = 1)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"buyer_user_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"total_kopecks" bigint NOT NULL,
	"buyer_phone" text NOT NULL,
	"comment" text,
	"client_checkout_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_buyer_user_id_client_checkout_id_shop_id_unique" UNIQUE("buyer_user_id","client_checkout_id","shop_id"),
	CONSTRAINT "orders_total_kopecks_check" CHECK ("orders"."total_kopecks" >= 0),
	CONSTRAINT "orders_comment_length_check" CHECK ("orders"."comment" IS NULL OR char_length("orders"."comment") <= 500)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_buyer_user_id_created_at_idx" ON "orders" USING btree ("buyer_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_shop_id_created_at_idx" ON "orders" USING btree ("shop_id","created_at" DESC NULLS LAST);