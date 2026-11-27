import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/session.js";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type AppModule = typeof import("../app.js");
type DbClientModule = typeof import("../db/client.js");

let appModule!: AppModule;
let app!: ReturnType<AppModule["buildApp"]>;
let dbClient!: DbClientModule;

function phone(...parts: string[]): string {
  return parts.join("");
}

function userPhone(index: number): string {
  return phone("+7", "999", String(index).padStart(7, "0"));
}

type TestUser = { id: number; cookie: string };

async function createUser(index: number): Promise<TestUser> {
  const result = await dbClient
    .requirePool()
    .query<{ id: number }>("INSERT INTO users (phone) VALUES ($1) RETURNING id", [
      userPhone(index),
    ]);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test user");
  }

  return { id, cookie: `${SESSION_COOKIE_NAME}=${app.jwt.sign({ sub: id })}` };
}

function request(user: TestUser, method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie: user.cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

type ProductBody = {
  id: number;
  name: string;
  description: string | null;
  priceKopecks: number;
  imageUrl: string | null;
  weightG: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  status: "draft" | "published" | "hidden";
};

async function createShop(user: TestUser, slug: string, name = "Винтаж на районе") {
  const response = await request(user, "POST", "/seller/shop", { name, slug });
  expect(response.statusCode).toBe(201);
  return response.json().shop as { id: number; slug: string };
}

async function publishShop(user: TestUser): Promise<void> {
  const response = await request(user, "PATCH", "/seller/shop", { status: "published" });
  expect(response.statusCode).toBe(200);
}

async function createProduct(
  user: TestUser,
  payload: Record<string, unknown>,
): Promise<ProductBody> {
  const response = await request(user, "POST", "/seller/products", payload);
  expect(response.statusCode).toBe(201);
  return response.json().product as ProductBody;
}

async function listProducts(user: TestUser): Promise<ProductBody[]> {
  const response = await request(user, "GET", "/seller/products");
  expect(response.statusCode).toBe(200);
  return response.json().products as ProductBody[];
}

async function countProducts(): Promise<number> {
  const result = await dbClient
    .requirePool()
    .query<{ count: number }>("SELECT count(*)::int AS count FROM products");
  return result.rows[0]?.count ?? 0;
}

describeWithDb("seller product routes with a real database", () => {
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

  it("returns 401 on every seller product route without a session", async () => {
    const productId = 1;
    const requests = [
      app.inject({ method: "GET", url: "/seller/products" }),
      app.inject({
        method: "POST",
        url: "/seller/products",
        payload: { name: "Куртка", priceKopecks: 1000 },
      }),
      app.inject({
        method: "PATCH",
        url: `/seller/products/${productId}`,
        payload: { name: "Куртка" },
      }),
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("returns an empty list before the seller creates a shop", async () => {
    const user = await createUser(1);

    const response = await request(user, "GET", "/seller/products");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ products: [] });
  });

  it("rejects product creation with 409 shop_required without a shop", async () => {
    const user = await createUser(1);

    const response = await request(user, "POST", "/seller/products", {
      name: "Куртка 90-х",
      priceKopecks: 420_000,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "shop_required" });
    expect(await countProducts()).toBe(0);
  });

  it("creates a draft product inside the seller's shop", async () => {
    const user = await createUser(1);
    const shop = await createShop(user, "vintage-shop");

    const response = await request(user, "POST", "/seller/products", {
      name: "Куртка 90-х",
      description: "Винтажная джинсовая куртка",
      priceKopecks: 420_000,
      imageUrl: "https://example.com/jacket.jpg",
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      product: {
        id: expect.any(Number),
        name: "Куртка 90-х",
        description: "Винтажная джинсовая куртка",
        priceKopecks: 420_000,
        imageUrl: "https://example.com/jacket.jpg",
        weightG: null,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
        status: "draft",
      },
    });
    expect(body.product).not.toHaveProperty("createdAt");
    expect(body.product).not.toHaveProperty("updatedAt");

    const stored = await dbClient
      .requirePool()
      .query<{ shop_id: number; status: string }>(
        "SELECT shop_id, status FROM products WHERE id = $1",
        [body.product.id],
      );
    expect(stored.rows).toEqual([{ shop_id: shop.id, status: "draft" }]);

    expect(await listProducts(user)).toEqual([body.product]);
  });

  it("always creates a draft even when a status is sent", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");

    const body = await createProduct(user, {
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      status: "published",
    });

    expect(body.status).toBe("draft");
  });

  it("rejects invalid create payloads with 400 and stores nothing", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");

    const valid = { name: "Куртка 90-х", priceKopecks: 420_000 };
    const invalidPayloads: Array<Record<string, unknown>> = [
      {},
      { priceKopecks: 420_000 },
      { name: "Куртка 90-х" },
      { ...valid, name: "" },
      { ...valid, name: "   " },
      { ...valid, name: "a".repeat(121) },
      { ...valid, priceKopecks: -1 },
      { ...valid, priceKopecks: 1.5 },
      { ...valid, priceKopecks: 2_147_483_648 },
      { ...valid, priceKopecks: "420000" },
      { ...valid, description: "a".repeat(2001) },
      { ...valid, imageUrl: "a".repeat(2001) },
      { ...valid, name: "A\u0000B" },
      { ...valid, description: "X\u0000Y" },
      { ...valid, imageUrl: "https://example.com/\u0000.jpg" },
    ];

    for (const payload of invalidPayloads) {
      const response = await request(user, "POST", "/seller/products", payload);

      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_request" });
    }

    expect(await countProducts()).toBe(0);
  });

  it("accepts the price and length boundaries", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");

    const free = await createProduct(user, {
      name: "a".repeat(120),
      priceKopecks: 0,
      description: "a".repeat(2000),
      imageUrl: "a".repeat(2000),
    });
    expect(free.status).toBe("draft");
    expect(free.name).toHaveLength(120);

    const maxPrice = await createProduct(user, {
      name: "Дорогая вещь",
      priceKopecks: 2_147_483_647,
      imageUrl: null,
    });
    expect(maxPrice.priceKopecks).toBe(2_147_483_647);
    expect(maxPrice.imageUrl).toBeNull();
  });

  it("lists only the seller's products in all statuses ordered by updated_at desc", async () => {
    const first = await createUser(1);
    const second = await createUser(2);
    await createShop(first, "first-shop", "Первый магазин");
    await createShop(second, "second-shop", "Второй магазин");

    const oldest = await createProduct(first, { name: "Старый", priceKopecks: 100 });
    const middle = await createProduct(first, { name: "Средний", priceKopecks: 200 });
    const newest = await createProduct(first, { name: "Новый", priceKopecks: 300 });
    const foreign = await createProduct(second, { name: "Чужой", priceKopecks: 400 });

    const placements = [
      { id: oldest.id, updatedAt: "2026-01-01T00:00:00Z", status: "draft" },
      { id: middle.id, updatedAt: "2026-02-01T00:00:00Z", status: "hidden" },
      { id: newest.id, updatedAt: "2026-03-01T00:00:00Z", status: "published" },
    ];
    for (const placement of placements) {
      await dbClient
        .requirePool()
        .query(
          "UPDATE products SET updated_at = $2::timestamptz, status = $3::product_status WHERE id = $1",
          [placement.id, placement.updatedAt, placement.status],
        );
    }
    await dbClient
      .requirePool()
      .query("UPDATE products SET updated_at = '2026-04-01T00:00:00Z' WHERE id = $1", [foreign.id]);

    const products = await listProducts(first);

    expect(products.map((product) => product.id)).toEqual([newest.id, middle.id, oldest.id]);
    expect(products.map((product) => product.status)).toEqual(["published", "hidden", "draft"]);
    expect(products.some((product) => product.id === foreign.id)).toBe(false);

    const secondProducts = await listProducts(second);
    expect(secondProducts.map((product) => product.id)).toEqual([foreign.id]);
  });

  it("forbids publishing a product while the shop is a draft", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");
    const product = await createProduct(user, { name: "Куртка 90-х", priceKopecks: 420_000 });

    const response = await request(user, "PATCH", `/seller/products/${product.id}`, {
      status: "published",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "shop_not_published" });
    expect(await listProducts(user)).toEqual([product]);

    await publishShop(user);
    const published = await request(user, "PATCH", `/seller/products/${product.id}`, {
      status: "published",
    });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toEqual({ product: { ...product, status: "published" } });
  });

  it("allows editing an already published product while the shop is a draft", async () => {
    const user = await createUser(1);
    const shop = await createShop(user, "vintage-shop");
    await publishShop(user);
    const product = await createProduct(user, { name: "Куртка 90-х", priceKopecks: 420_000 });
    const published = await request(user, "PATCH", `/seller/products/${product.id}`, {
      status: "published",
    });
    expect(published.statusCode).toBe(200);

    const unpublished = await request(user, "PATCH", "/seller/shop", { status: "draft" });
    expect(unpublished.statusCode).toBe(200);
    const hidden = await app.inject({ method: "GET", url: `/products/${product.id}` });
    expect(hidden.statusCode).toBe(404);

    const edit = await request(user, "PATCH", `/seller/products/${product.id}`, {
      name: "Куртка 90-х, обновлённая",
      status: "published",
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json()).toEqual({
      product: { ...product, name: "Куртка 90-х, обновлённая", status: "published" },
    });

    await publishShop(user);
    const visible = await app.inject({ method: "GET", url: `/products/${product.id}` });
    expect(visible.statusCode).toBe(200);
    expect(visible.json()).toEqual(expect.objectContaining({ name: "Куртка 90-х, обновлённая" }));
    expect((await app.inject({ method: "GET", url: `/shops/${shop.slug}` })).statusCode).toBe(200);
  });

  it("hides, republishes and drafts a product on the storefront", async () => {
    const user = await createUser(1);
    const shop = await createShop(user, "vintage-shop");
    await publishShop(user);
    const product = await createProduct(user, {
      name: "Куртка 90-х",
      description: "Винтажная джинсовая куртка",
      priceKopecks: 420_000,
    });

    const hiddenDraft = async () => {
      const catalog = await app.inject({ method: "GET", url: "/catalog/products" });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json()).toEqual({
        products: [],
        page: 1,
        pageSize: 100,
        total: 0,
        hasMore: false,
      });

      const shopPage = await app.inject({ method: "GET", url: `/shops/${shop.slug}` });
      expect(shopPage.statusCode).toBe(200);
      expect(shopPage.json()).toEqual({
        slug: shop.slug,
        name: "Винтаж на районе",
        description: null,
        products: [],
      });

      const detail = await app.inject({ method: "GET", url: `/products/${product.id}` });
      expect(detail.statusCode).toBe(404);
      expect(detail.json()).toEqual({ error: "not_found" });
    };

    await hiddenDraft();

    const publish = await request(user, "PATCH", `/seller/products/${product.id}`, {
      status: "published",
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json()).toEqual({ product: { ...product, status: "published" } });

    const card = {
      id: product.id,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      imageUrl: null,
      shop: { slug: shop.slug, name: "Винтаж на районе" },
    };

    const catalog = await app.inject({ method: "GET", url: "/catalog/products" });
    expect(catalog.json()).toEqual({
      products: [card],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    });

    const shopPage = await app.inject({ method: "GET", url: `/shops/${shop.slug}` });
    expect(shopPage.json()).toEqual({
      slug: shop.slug,
      name: "Винтаж на районе",
      description: null,
      products: [card],
    });

    const detail = await app.inject({ method: "GET", url: `/products/${product.id}` });
    expect(detail.json()).toEqual({ ...card, description: "Винтажная джинсовая куртка" });

    const hide = await request(user, "PATCH", `/seller/products/${product.id}`, {
      status: "hidden",
    });
    expect(hide.statusCode).toBe(200);
    expect(hide.json()).toEqual({ product: { ...product, status: "hidden" } });
    await hiddenDraft();

    const republish = await request(user, "PATCH", `/seller/products/${product.id}`, {
      status: "published",
    });
    expect(republish.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/catalog/products" })).json()).toEqual({
      products: [card],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    });

    const toDraft = await request(user, "PATCH", `/seller/products/${product.id}`, {
      status: "draft",
    });
    expect(toDraft.statusCode).toBe(200);
    expect(toDraft.json()).toEqual({ product: { ...product, status: "draft" } });
    await hiddenDraft();
  });

  it("allows hide and draft while the shop is a draft", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");
    const product = await createProduct(user, { name: "Куртка 90-х", priceKopecks: 420_000 });

    const hidden = await request(user, "PATCH", `/seller/products/${product.id}`, {
      status: "hidden",
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json()).toEqual({ product: { ...product, status: "hidden" } });

    const draft = await request(user, "PATCH", `/seller/products/${product.id}`, {
      status: "draft",
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toEqual({ product });
  });

  it("updates fields partially and clears nullable fields", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");
    const product = await createProduct(user, {
      name: "Куртка 90-х",
      description: "Старое описание",
      priceKopecks: 420_000,
      imageUrl: "https://example.com/old.jpg",
    });

    const response = await request(user, "PATCH", `/seller/products/${product.id}`, {
      name: "Джинсовая куртка",
      description: null,
      priceKopecks: 0,
      imageUrl: null,
      status: "hidden",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      product: {
        id: product.id,
        name: "Джинсовая куртка",
        description: null,
        priceKopecks: 0,
        imageUrl: null,
        weightG: null,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
        status: "hidden",
      },
    });

    expect(await listProducts(user)).toEqual([response.json().product]);

    const rename = await request(user, "PATCH", `/seller/products/${product.id}`, {
      name: "Куртка 90-х",
    });
    expect(rename.statusCode).toBe(200);
    expect(rename.json()).toEqual({
      product: expect.objectContaining({ name: "Куртка 90-х", priceKopecks: 0, status: "hidden" }),
    });
  });

  it("rejects invalid prices and empty updates with 400", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");
    const product = await createProduct(user, { name: "Куртка 90-х", priceKopecks: 420_000 });

    const invalidPayloads: Array<Record<string, unknown>> = [
      {},
      { priceKopecks: -1 },
      { priceKopecks: 1.5 },
      { priceKopecks: 2_147_483_648 },
      { priceKopecks: "420000" },
      { name: "" },
      { name: "a".repeat(121) },
      { description: "a".repeat(2001) },
      { imageUrl: "a".repeat(2001) },
      { name: "A\u0000B" },
      { description: "X\u0000Y" },
      { imageUrl: "https://example.com/\u0000.jpg" },
      { status: "blocked" },
    ];

    for (const payload of invalidPayloads) {
      const response = await request(user, "PATCH", `/seller/products/${product.id}`, payload);

      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_request" });
    }

    expect(await listProducts(user)).toEqual([product]);
  });

  it("rejects NUL bytes in text fields without creating or changing anything", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");

    const create = await request(user, "POST", "/seller/products", {
      name: "A\u0000B",
      priceKopecks: 420_000,
    });
    expect(create.statusCode).toBe(400);
    expect(create.json()).toEqual({ error: "invalid_request" });
    expect(await countProducts()).toBe(0);

    const product = await createProduct(user, {
      name: "Куртка 90-х",
      description: "Старое описание",
      priceKopecks: 420_000,
    });
    const update = await request(user, "PATCH", `/seller/products/${product.id}`, {
      description: "X\u0000Y",
    });
    expect(update.statusCode).toBe(400);
    expect(update.json()).toEqual({ error: "invalid_request" });
    expect(await listProducts(user)).toEqual([product]);
  });

  it("returns 400 for a malformed product id", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");

    const response = await request(user, "PATCH", "/seller/products/not-a-number", { name: "X" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("rejects out-of-range product ids with 400 and the int4 max with 404", async () => {
    const user = await createUser(1);
    await createShop(user, "vintage-shop");

    for (const id of ["2147483648", "3000000000"]) {
      const response = await request(user, "PATCH", `/seller/products/${id}`, { name: "X" });

      expect(response.statusCode, id).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_request" });
    }

    const maxId = await request(user, "PATCH", "/seller/products/2147483647", { name: "X" });
    expect(maxId.statusCode).toBe(404);
    expect(maxId.json()).toEqual({ error: "not_found" });
  });

  it("returns 404 for another seller's product and leaves it unchanged", async () => {
    const first = await createUser(1);
    const second = await createUser(2);
    await createShop(first, "first-shop", "Первый магазин");
    await createShop(second, "second-shop", "Второй магазин");
    const product = await createProduct(first, { name: "Куртка 90-х", priceKopecks: 420_000 });

    const foreignUpdate = await request(second, "PATCH", `/seller/products/${product.id}`, {
      name: "Взлом",
      status: "hidden",
    });
    expect(foreignUpdate.statusCode).toBe(404);
    expect(foreignUpdate.json()).toEqual({ error: "not_found" });

    expect(await listProducts(first)).toEqual([product]);
    expect(await listProducts(second)).toEqual([]);

    const missing = await request(first, "PATCH", "/seller/products/999999", { name: "Нет" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "not_found" });
  });

  it("hides every product when the shop is unpublished", async () => {
    const user = await createUser(1);
    const shop = await createShop(user, "vintage-shop");
    await publishShop(user);
    const product = await createProduct(user, { name: "Куртка 90-х", priceKopecks: 420_000 });
    await request(user, "PATCH", `/seller/products/${product.id}`, { status: "published" });

    const visible = await app.inject({ method: "GET", url: `/products/${product.id}` });
    expect(visible.statusCode).toBe(200);

    const unpublished = await request(user, "PATCH", "/seller/shop", { status: "draft" });
    expect(unpublished.statusCode).toBe(200);

    const catalog = await app.inject({ method: "GET", url: "/catalog/products" });
    expect(catalog.json()).toEqual({
      products: [],
      page: 1,
      pageSize: 100,
      total: 0,
      hasMore: false,
    });

    const shopPage = await app.inject({ method: "GET", url: `/shops/${shop.slug}` });
    expect(shopPage.statusCode).toBe(404);

    const detail = await app.inject({ method: "GET", url: `/products/${product.id}` });
    expect(detail.statusCode).toBe(404);

    const stored = await listProducts(user);
    expect(stored).toEqual([{ ...product, status: "published" }]);

    await publishShop(user);
    const republished = await app.inject({ method: "GET", url: `/products/${product.id}` });
    expect(republished.statusCode).toBe(200);
  });
});
