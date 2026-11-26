import { eq } from "drizzle-orm";
import { requireDb, requirePool } from "./client.js";
import { appMeta, products, sellers, shops } from "./schema.js";

const db = requireDb();
const demoSlug = "local-hand-demo";

await db
  .insert(appMeta)
  .values({ key: "schema_version", value: "2" })
  .onConflictDoUpdate({
    target: appMeta.key,
    set: { value: "2", updatedAt: new Date() },
  });

const [existingShop] = await db.select().from(shops).where(eq(shops.slug, demoSlug)).limit(1);

let shopId: number;

if (existingShop) {
  shopId = existingShop.id;
  await db
    .update(shops)
    .set({
      name: "Винтаж на районе",
      description: "Тестовый магазин Local Hand: винтаж, локальные вещи и цифровые работы.",
      status: "published",
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shopId));
} else {
  const [seller] = await db
    .insert(sellers)
    .values({ displayName: "Local Hand Demo" })
    .returning({ id: sellers.id });

  if (!seller) {
    throw new Error("Failed to create demo seller");
  }

  const [shop] = await db
    .insert(shops)
    .values({
      sellerId: seller.id,
      slug: demoSlug,
      name: "Винтаж на районе",
      description: "Тестовый магазин Local Hand: винтаж, локальные вещи и цифровые работы.",
      status: "published",
    })
    .returning({ id: shops.id });

  if (!shop) {
    throw new Error("Failed to create demo shop");
  }

  shopId = shop.id;
}

await db.delete(products).where(eq(products.shopId, shopId));

await db.insert(products).values([
  {
    shopId,
    name: "Куртка 90-х",
    description: "Винтажная куртка, состояние хорошее. Замеры по запросу.",
    priceKopecks: 420_000,
    status: "published",
  },
  {
    shopId,
    name: "Свитер ручной вязки",
    description: "Локальный бренд, шерсть, ручная работа.",
    priceKopecks: 680_000,
    status: "published",
  },
  {
    shopId,
    name: "Сумка из остатков кожи",
    description: "Небольшая партия, натуральная кожа, ручная сборка.",
    priceKopecks: 950_000,
    status: "published",
  },
  {
    shopId,
    name: "Цифровой зин",
    description: "PDF-зин локального автора. Ссылка приходит после оплаты.",
    priceKopecks: 49_000,
    status: "published",
  },
]);

await requirePool().end();
