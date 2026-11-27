import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Catalog discovery against a real database: search by product/shop name,
 * LIKE wildcard escaping, sorting, pagination, visibility and validation.
 */
const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

if (process.env.CI && !testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is required to run storefront DB tests in CI");
}

type AppModule = typeof import("../app.js");
type DbClientModule = typeof import("../db/client.js");

let appModule!: AppModule;
let app!: ReturnType<AppModule["buildApp"]>;
let dbClient!: DbClientModule;

type ShopStatus = "draft" | "published" | "blocked";
type ProductStatus = "draft" | "published" | "hidden";

type ShopInput = { slug: string; name?: string; status?: ShopStatus };
type ProductInput = {
  shopId: number;
  name: string;
  priceKopecks: number;
  status?: ProductStatus;
  createdAt?: string;
};

async function insertShop(input: ShopInput): Promise<{ id: number; slug: string; name: string }> {
  const pool = dbClient.requirePool();
  const name = input.name ?? "Винтаж на районе";
  const seller = await pool.query<{ id: number }>(
    "INSERT INTO sellers (display_name) VALUES ($1) RETURNING id",
    ["Тестовый продавец"],
  );
  const sellerId = seller.rows[0]?.id;
  if (!sellerId) {
    throw new Error("failed to insert a seller");
  }

  const shop = await pool.query<{ id: number }>(
    `INSERT INTO shops (seller_id, slug, name, status)
     VALUES ($1, $2, $3, $4::shop_status)
     RETURNING id`,
    [sellerId, input.slug, name, input.status ?? "published"],
  );
  const id = shop.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a shop");
  }

  return { id, slug: input.slug, name };
}

async function insertProduct(input: ProductInput): Promise<{ id: number }> {
  const result = await dbClient.requirePool().query<{ id: number }>(
    `INSERT INTO products (shop_id, name, price_kopecks, status, created_at)
     VALUES ($1, $2, $3, $4::product_status, COALESCE($5::timestamptz, now()))
     RETURNING id`,
    [
      input.shopId,
      input.name,
      input.priceKopecks,
      input.status ?? "published",
      input.createdAt ?? null,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a product");
  }
  return { id };
}

function productCard(
  product: { id: number; name: string; priceKopecks: number },
  shop: { slug: string; name: string },
) {
  return {
    id: product.id,
    name: product.name,
    priceKopecks: product.priceKopecks,
    imageUrl: null,
    shop: { slug: shop.slug, name: shop.name },
  };
}

async function getCatalog(query = "") {
  return app.inject({ method: "GET", url: `/catalog/products${query}` });
}

describeWithDb("catalog discovery with a real database", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("../db/client.js");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbClient.requireDb(), { migrationsFolder });

    appModule = await import("../app.js");
    app = appModule.buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await dbClient?.requirePool().end();
  });

  beforeEach(async () => {
    await dbClient
      .requirePool()
      .query("TRUNCATE TABLE products, shops, sellers, users, otp_codes RESTART IDENTITY CASCADE");
  });

  it("returns the published catalog with default page and pageSize", async () => {
    const shop = await insertShop({ slug: "vintage-shop" });
    const older = await insertProduct({
      shopId: shop.id,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const newer = await insertProduct({
      shopId: shop.id,
      name: "Ваза из стекла",
      priceKopecks: 89_900,
      createdAt: "2026-02-01T00:00:00Z",
    });

    const response = await getCatalog();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [
        productCard({ id: newer.id, name: "Ваза из стекла", priceKopecks: 89_900 }, shop),
        productCard({ id: older.id, name: "Куртка 90-х", priceKopecks: 420_000 }, shop),
      ],
      page: 1,
      pageSize: 100,
      total: 2,
      hasMore: false,
    });
  });

  it("searches published products by a part of the product name, case-insensitively", async () => {
    const shop = await insertShop({ slug: "vintage-shop" });
    const jacket = await insertProduct({
      shopId: shop.id,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
    });
    await insertProduct({ shopId: shop.id, name: "Ваза из стекла", priceKopecks: 89_900 });

    const response = await getCatalog("?q=%20КУРТ%20");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [productCard({ id: jacket.id, name: "Куртка 90-х", priceKopecks: 420_000 }, shop)],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    });
  });

  it("searches by a part of the shop name and returns products of matching shops", async () => {
    const vintage = await insertShop({ slug: "vintage-shop", name: "Винтаж на районе" });
    const city = await insertShop({ slug: "city-shop", name: "Городской винтаж" });
    const other = await insertShop({ slug: "other-shop", name: "Керамика" });

    const jacket = await insertProduct({
      shopId: vintage.id,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const boots = await insertProduct({
      shopId: city.id,
      name: "Кожаные ботинки",
      priceKopecks: 300_000,
      createdAt: "2026-02-01T00:00:00Z",
    });
    await insertProduct({
      shopId: other.id,
      name: "Ваза из стекла",
      priceKopecks: 89_900,
      createdAt: "2026-03-01T00:00:00Z",
    });

    const response = await getCatalog("?q=ВИНТАЖ");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [
        productCard({ id: boots.id, name: "Кожаные ботинки", priceKopecks: 300_000 }, city),
        productCard({ id: jacket.id, name: "Куртка 90-х", priceKopecks: 420_000 }, vintage),
      ],
      page: 1,
      pageSize: 100,
      total: 2,
      hasMore: false,
    });
  });

  it("treats LIKE wildcards in the search query as literal characters", async () => {
    const shop = await insertShop({ slug: "vintage-shop" });
    const percent = await insertProduct({
      shopId: shop.id,
      name: "Скидка 50% на всё",
      priceKopecks: 10_000,
    });
    const underscore = await insertProduct({
      shopId: shop.id,
      name: "Куртка_90-х",
      priceKopecks: 20_000,
    });
    await insertProduct({ shopId: shop.id, name: "Скидка 500 рублей", priceKopecks: 30_000 });

    const percentResponse = await getCatalog("?q=%25");
    expect(percentResponse.statusCode).toBe(200);
    expect(percentResponse.json()).toEqual({
      products: [
        productCard({ id: percent.id, name: "Скидка 50% на всё", priceKopecks: 10_000 }, shop),
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    });

    const underscoreResponse = await getCatalog("?q=_");
    expect(underscoreResponse.statusCode).toBe(200);
    expect(underscoreResponse.json()).toEqual({
      products: [
        productCard({ id: underscore.id, name: "Куртка_90-х", priceKopecks: 20_000 }, shop),
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    });

    const exactResponse = await getCatalog("?q=50%25");
    expect(exactResponse.statusCode).toBe(200);
    expect(exactResponse.json()).toEqual({
      products: [
        productCard({ id: percent.id, name: "Скидка 50% на всё", priceKopecks: 10_000 }, shop),
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    });
  });

  it("sorts by newest with a stable id tie-break", async () => {
    const shop = await insertShop({ slug: "vintage-shop" });
    const oldest = await insertProduct({
      shopId: shop.id,
      name: "Старый",
      priceKopecks: 300,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const middle = await insertProduct({
      shopId: shop.id,
      name: "Средний",
      priceKopecks: 100,
      createdAt: "2026-02-01T00:00:00Z",
    });
    const tiedLower = await insertProduct({
      shopId: shop.id,
      name: "Новый первый",
      priceKopecks: 100,
      createdAt: "2026-03-01T00:00:00Z",
    });
    const tiedHigher = await insertProduct({
      shopId: shop.id,
      name: "Новый второй",
      priceKopecks: 300,
      createdAt: "2026-03-01T00:00:00Z",
    });

    const response = await getCatalog("?sort=newest");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [
        productCard({ id: tiedHigher.id, name: "Новый второй", priceKopecks: 300 }, shop),
        productCard({ id: tiedLower.id, name: "Новый первый", priceKopecks: 100 }, shop),
        productCard({ id: middle.id, name: "Средний", priceKopecks: 100 }, shop),
        productCard({ id: oldest.id, name: "Старый", priceKopecks: 300 }, shop),
      ],
      page: 1,
      pageSize: 100,
      total: 4,
      hasMore: false,
    });
  });

  it("sorts by price ascending and descending with a stable id tie-break", async () => {
    const shop = await insertShop({ slug: "vintage-shop" });
    const expensiveFirst = await insertProduct({
      shopId: shop.id,
      name: "Дорогая первая",
      priceKopecks: 300,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const cheapLower = await insertProduct({
      shopId: shop.id,
      name: "Дешёвая первая",
      priceKopecks: 100,
      createdAt: "2026-02-01T00:00:00Z",
    });
    const cheapHigher = await insertProduct({
      shopId: shop.id,
      name: "Дешёвая вторая",
      priceKopecks: 100,
      createdAt: "2026-03-01T00:00:00Z",
    });
    const expensive = await insertProduct({
      shopId: shop.id,
      name: "Дорогая вторая",
      priceKopecks: 300,
      createdAt: "2026-03-01T00:00:00Z",
    });

    const ascending = await getCatalog("?sort=price_asc");
    expect(ascending.statusCode).toBe(200);
    expect(ascending.json()).toEqual({
      products: [
        productCard({ id: cheapHigher.id, name: "Дешёвая вторая", priceKopecks: 100 }, shop),
        productCard({ id: cheapLower.id, name: "Дешёвая первая", priceKopecks: 100 }, shop),
        productCard({ id: expensive.id, name: "Дорогая вторая", priceKopecks: 300 }, shop),
        productCard({ id: expensiveFirst.id, name: "Дорогая первая", priceKopecks: 300 }, shop),
      ],
      page: 1,
      pageSize: 100,
      total: 4,
      hasMore: false,
    });

    const descending = await getCatalog("?sort=price_desc");
    expect(descending.statusCode).toBe(200);
    expect(descending.json()).toEqual({
      products: [
        productCard({ id: expensive.id, name: "Дорогая вторая", priceKopecks: 300 }, shop),
        productCard({ id: expensiveFirst.id, name: "Дорогая первая", priceKopecks: 300 }, shop),
        productCard({ id: cheapHigher.id, name: "Дешёвая вторая", priceKopecks: 100 }, shop),
        productCard({ id: cheapLower.id, name: "Дешёвая первая", priceKopecks: 100 }, shop),
      ],
      page: 1,
      pageSize: 100,
      total: 4,
      hasMore: false,
    });
  });

  it("paginates with page/pageSize, total and hasMore", async () => {
    const shop = await insertShop({ slug: "vintage-shop" });
    const products = [];
    for (let index = 1; index <= 5; index += 1) {
      const product = await insertProduct({
        shopId: shop.id,
        name: `Товар ${index}`,
        priceKopecks: index * 1000,
        createdAt: `2026-0${index}-01T00:00:00Z`,
      });
      products.push(product);
    }

    const expected = products.map((product, index) =>
      productCard(
        { id: product.id, name: `Товар ${index + 1}`, priceKopecks: (index + 1) * 1000 },
        shop,
      ),
    );

    const first = await getCatalog("?page=1&pageSize=2");
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      products: [expected[4], expected[3]],
      page: 1,
      pageSize: 2,
      total: 5,
      hasMore: true,
    });

    const second = await getCatalog("?page=2&pageSize=2");
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({
      products: [expected[2], expected[1]],
      page: 2,
      pageSize: 2,
      total: 5,
      hasMore: true,
    });

    const third = await getCatalog("?page=3&pageSize=2");
    expect(third.statusCode).toBe(200);
    expect(third.json()).toEqual({
      products: [expected[0]],
      page: 3,
      pageSize: 2,
      total: 5,
      hasMore: false,
    });

    const beyond = await getCatalog("?page=4&pageSize=2");
    expect(beyond.statusCode).toBe(200);
    expect(beyond.json()).toEqual({
      products: [],
      page: 4,
      pageSize: 2,
      total: 5,
      hasMore: false,
    });
  });

  it("returns 200 with an empty list when nothing matches", async () => {
    const shop = await insertShop({ slug: "vintage-shop" });
    await insertProduct({ shopId: shop.id, name: "Куртка 90-х", priceKopecks: 420_000 });

    const response = await getCatalog("?q=невидимый");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [],
      page: 1,
      pageSize: 100,
      total: 0,
      hasMore: false,
    });
  });

  it("treats an empty search query as no search", async () => {
    const shop = await insertShop({ slug: "vintage-shop" });
    const jacket = await insertProduct({
      shopId: shop.id,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
    });

    const response = await getCatalog("?q=%20%20");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [productCard({ id: jacket.id, name: "Куртка 90-х", priceKopecks: 420_000 }, shop)],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    });
  });

  it("hides draft/hidden products and draft/blocked shops from the catalog and search", async () => {
    const visibleShop = await insertShop({ slug: "visible-shop", name: "Видимый магазин" });
    const draftShop = await insertShop({
      slug: "draft-shop",
      name: "Черновой магазин",
      status: "draft",
    });
    const blockedShop = await insertShop({
      slug: "blocked-shop",
      name: "Заблокированный магазин",
      status: "blocked",
    });

    const visible = await insertProduct({
      shopId: visibleShop.id,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
    });
    await insertProduct({
      shopId: visibleShop.id,
      name: "Черновик куртки",
      priceKopecks: 100,
      status: "draft",
    });
    await insertProduct({
      shopId: visibleShop.id,
      name: "Скрытая куртка",
      priceKopecks: 100,
      status: "hidden",
    });
    await insertProduct({
      shopId: draftShop.id,
      name: "Куртка чернового магазина",
      priceKopecks: 100,
    });
    await insertProduct({
      shopId: blockedShop.id,
      name: "Куртка заблокированного магазина",
      priceKopecks: 100,
    });

    const catalog = await getCatalog();
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toEqual({
      products: [
        productCard({ id: visible.id, name: "Куртка 90-х", priceKopecks: 420_000 }, visibleShop),
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    });

    for (const query of ["?q=чернов", "?q=скрытая", "?q=заблокированный"]) {
      const hidden = await getCatalog(query);
      expect(hidden.statusCode, query).toBe(200);
      expect(hidden.json(), query).toEqual({
        products: [],
        page: 1,
        pageSize: 100,
        total: 0,
        hasMore: false,
      });
    }
  });

  it.each([
    "?page=0",
    "?page=-1",
    "?page=1.5",
    "?page=abc",
    "?pageSize=0",
    "?pageSize=101",
    "?pageSize=1.5",
    "?pageSize=abc",
    "?sort=popular",
    "?sort=",
    `?q=${"a".repeat(101)}`,
  ])("returns 400 for invalid query %s", async (query) => {
    const shop = await insertShop({ slug: "vintage-shop" });
    await insertProduct({ shopId: shop.id, name: "Куртка 90-х", priceKopecks: 420_000 });

    const response = await getCatalog(query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });
});
