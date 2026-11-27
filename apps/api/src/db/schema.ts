import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const shopStatuses = ["draft", "published", "blocked"] as const;
export const productStatuses = ["draft", "published", "hidden"] as const;
export const orderStatuses = ["new", "payment_pending", "paid"] as const;
export const sellerPaymentAccountStatuses = ["active", "superseded", "disabled", "error"] as const;
export const paymentStatuses = [
  "pending",
  "succeeded",
  "canceled",
  "failed",
  "manual_review",
] as const;

export const shopStatusEnum = pgEnum("shop_status", shopStatuses);
export const productStatusEnum = pgEnum("product_status", productStatuses);
export const orderStatusEnum = pgEnum("order_status", orderStatuses);
export const sellerPaymentAccountStatusEnum = pgEnum(
  "seller_payment_account_status",
  sellerPaymentAccountStatuses,
);
export const paymentStatusEnum = pgEnum("payment_status", paymentStatuses);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("otp_codes_phone_created_at_idx").on(table.phone, table.createdAt)],
);

export const sellers = pgTable("sellers", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  userId: integer("user_id")
    .unique()
    .references(() => users.id, { onDelete: "set null" }),
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

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    buyerUserId: integer("buyer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("new"),
    totalKopecks: bigint("total_kopecks", { mode: "number" }).notNull(),
    buyerPhone: text("buyer_phone").notNull(),
    comment: text("comment"),
    clientCheckoutId: uuid("client_checkout_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("orders_buyer_user_id_client_checkout_id_shop_id_unique").on(
      table.buyerUserId,
      table.clientCheckoutId,
      table.shopId,
    ),
    check("orders_total_kopecks_check", sql`${table.totalKopecks} >= 0`),
    check(
      "orders_comment_length_check",
      sql`${table.comment} IS NULL OR char_length(${table.comment}) <= 500`,
    ),
    index("orders_buyer_user_id_created_at_idx").on(table.buyerUserId, table.createdAt.desc()),
    index("orders_shop_id_created_at_idx").on(table.shopId, table.createdAt.desc()),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    priceKopecks: integer("price_kopecks").notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => [
    check("order_items_price_kopecks_check", sql`${table.priceKopecks} >= 0`),
    check("order_items_quantity_check", sql`${table.quantity} = 1`),
    index("order_items_order_id_idx").on(table.orderId),
  ],
);

export const sellerPaymentAccounts = pgTable(
  "seller_payment_accounts",
  {
    id: serial("id").primaryKey(),
    sellerId: integer("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    isTest: boolean("is_test").notNull().default(false),
    tokenCiphertext: bytea("token_ciphertext").notNull(),
    tokenKeyVersion: smallint("token_key_version").notNull(),
    status: sellerPaymentAccountStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seller_payment_accounts_seller_id_active_unique")
      .on(table.sellerId)
      .where(sql`${table.status} = 'active'`),
    index("seller_payment_accounts_seller_id_connected_at_idx").on(
      table.sellerId,
      table.connectedAt.desc(),
    ),
    index("seller_payment_accounts_provider_account_idx").on(
      table.provider,
      table.providerAccountId,
    ),
    check("seller_payment_accounts_token_key_version_check", sql`${table.tokenKeyVersion} > 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    sellerAccountId: integer("seller_account_id")
      .notNull()
      .references(() => sellerPaymentAccounts.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountKopecks: bigint("amount_kopecks", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("RUB"),
    confirmationUrl: text("confirmation_url"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    unique("payments_order_id_idempotency_key_unique").on(table.orderId, table.idempotencyKey),
    uniqueIndex("payments_order_id_active_unique")
      .on(table.orderId)
      .where(sql`${table.status} IN ('pending', 'manual_review')`),
    uniqueIndex("payments_provider_payment_id_unique")
      .on(table.providerPaymentId)
      .where(sql`${table.providerPaymentId} IS NOT NULL`),
    index("payments_order_id_created_at_idx").on(table.orderId, table.createdAt.desc()),
    index("payments_seller_account_id_idx").on(table.sellerAccountId),
    check("payments_amount_kopecks_check", sql`${table.amountKopecks} >= 0`),
    check("payments_currency_check", sql`${table.currency} = 'RUB'`),
  ],
);

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
