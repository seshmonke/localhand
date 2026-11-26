import { index, integer, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const shopStatuses = ["draft", "published", "blocked"] as const;
export const productStatuses = ["draft", "published", "hidden"] as const;

export const shopStatusEnum = pgEnum("shop_status", shopStatuses);
export const productStatusEnum = pgEnum("product_status", productStatuses);

export const sellers = pgTable("sellers", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shops = pgTable("shops", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id")
    .notNull()
    .unique()
    .references(() => sellers.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  status: shopStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceKopecks: integer("price_kopecks").notNull(),
    imageUrl: text("image_url"),
    status: productStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("products_shop_id_idx").on(table.shopId)],
);

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
