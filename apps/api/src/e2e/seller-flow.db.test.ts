import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/session.js";

/**
 * End-to-end API test of the main seller scenario on a real database:
 * dev OTP -> session -> shop draft -> publish -> product draft -> publish ->
 * public catalog/shop/product pages. A second seller must not be able to
 * change the first seller's shop or product.
 */
const testDatabaseUrl = process.env.DATABASE_URL_TEST;

// A skipped real-DB e2e is a silent coverage hole in CI, so fail loudly.
if (process.env.CI && !testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is required to run the seller flow e2e in CI");
}

function assertTestDatabase(connectionString: string): void {
  let databaseName: string;

  try {
    databaseName = decodeURIComponent(new URL(connectionString).pathname);
  } catch {
    throw new Error("DATABASE_URL_TEST must be a valid PostgreSQL URL");
  }

  if (!databaseName.includes("_test")) {
    throw new Error(
      'DATABASE_URL_TEST must point to a database whose name contains "_test"; refusing to migrate and truncate it',
    );
  }
}

// The suite truncates tables in beforeEach: never run it against a non-test DB.
if (testDatabaseUrl) {
  assertTestDatabase(testDatabaseUrl);
}

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

const FIRST_PHONE = phone("+7", "999", "555", "10", "01");
const SECOND_PHONE = phone("+7", "999", "555", "10", "02");
const FIRST_SHOP_SLUG = "s1-5-vintage";
const SECOND_SHOP_SLUG = "s1-5-second";

type Session = { user: { id: number; phone: string }; cookie: string };
type Shop = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "blocked";
};
type Product = {
  id: number;
  name: string;
  description: string | null;
  priceKopecks: number;
  imageUrl: string | null;
  status: "draft" | "published" | "hidden";
};

function sessionCookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers["set-cookie"];
  const header = Array.isArray(value) ? value.join("\n") : String(value ?? "");
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;\\n]+)`).exec(header);
  const token = match?.[1];
  if (!token) {
    throw new Error("verify-code response did not set the session cookie");
  }
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function login(targetPhone: string): Promise<Session> {
  const requested = await app.inject({
    method: "POST",
    url: "/auth/request-code",
    payload: { phone: targetPhone },
  });
  expect(requested.statusCode).toBe(200);
  const devCode = requested.json<{ devCode?: string }>().devCode;
  expect(devCode).toMatch(/^\d{6}$/);

  const verified = await app.inject({
    method: "POST",
    url: "/auth/verify-code",
    payload: { phone: targetPhone, code: devCode },
  });
  expect(verified.statusCode).toBe(200);

  const user = verified.json<{ user: { id: number; phone: string } }>().user;
  expect(user.phone).toBe(targetPhone);

  return { user, cookie: sessionCookieFrom(verified) };
}

function request(method: "GET" | "POST" | "PATCH", url: string, cookie: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

async function createShop(session: Session, input: Record<string, unknown>): Promise<Shop> {
  const response = await request("POST", "/seller/shop", session.cookie, input);
  expect(response.statusCode).toBe(201);
  return response.json<{ shop: Shop }>().shop;
}

async function publishShop(session: Session): Promise<void> {
  const response = await request("PATCH", "/seller/shop", session.cookie, { status: "published" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ shop: expect.objectContaining({ status: "published" }) });
}

async function createProduct(session: Session, input: Record<string, unknown>): Promise<Product> {
  const response = await request("POST", "/seller/products", session.cookie, input);
  expect(response.statusCode).toBe(201);
  return response.json<{ product: Product }>().product;
}

async function publishProduct(session: Session, productId: number): Promise<void> {
  const response = await request("PATCH", `/seller/products/${productId}`, session.cookie, {
    status: "published",
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ product: expect.objectContaining({ status: "published" }) });
}

async function countRows(table: "users" | "otp_codes"): Promise<number> {
  const result = await dbClient
    .requirePool()
    .query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
  return result.rows[0]?.count ?? 0;
}

describeWithDb("seller flow end-to-end with a real database", () => {
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

  it("takes a new seller from dev OTP to a published product on the storefront", async () => {
    const session = await login(FIRST_PHONE);

    const me = await request("GET", "/auth/me", session.cookie);
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ user: session.user });
    expect(await countRows("users")).toBe(1);

    const emptyShop = await request("GET", "/seller/shop", session.cookie);
    expect(emptyShop.statusCode).toBe(200);
    expect(emptyShop.json()).toEqual({ shop: null });

    const shop = await createShop(session, {
      name: "Винтаж на районе",
      slug: FIRST_SHOP_SLUG,
      description: "Секонд-хенд и винтаж",
    });
    expect(shop).toEqual({
      id: expect.any(Number),
      slug: FIRST_SHOP_SLUG,
      name: "Винтаж на районе",
      description: "Секонд-хенд и винтаж",
      status: "draft",
    });

    const hiddenShop = await app.inject({ method: "GET", url: `/shops/${FIRST_SHOP_SLUG}` });
    expect(hiddenShop.statusCode).toBe(404);

    await publishShop(session);

    const product = await createProduct(session, {
      name: "Куртка 90-х",
      description: "Винтажная джинсовая куртка",
      priceKopecks: 420_000,
    });
    expect(product).toEqual({
      id: expect.any(Number),
      name: "Куртка 90-х",
      description: "Винтажная джинсовая куртка",
      priceKopecks: 420_000,
      imageUrl: null,
      status: "draft",
    });

    const emptyCatalog = await app.inject({ method: "GET", url: "/catalog/products" });
    expect(emptyCatalog.statusCode).toBe(200);
    expect(emptyCatalog.json()).toEqual({ products: [] });

    await publishProduct(session, product.id);

    const card = {
      id: product.id,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      imageUrl: null,
      shop: { slug: FIRST_SHOP_SLUG, name: "Винтаж на районе" },
    };

    const catalog = await app.inject({ method: "GET", url: "/catalog/products" });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toEqual({ products: [card] });

    const shopPage = await app.inject({ method: "GET", url: `/shops/${FIRST_SHOP_SLUG}` });
    expect(shopPage.statusCode).toBe(200);
    expect(shopPage.json()).toEqual({
      slug: FIRST_SHOP_SLUG,
      name: "Винтаж на районе",
      description: "Секонд-хенд и винтаж",
      products: [card],
    });

    const detail = await app.inject({ method: "GET", url: `/products/${product.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual({
      ...card,
      description: "Винтажная джинсовая куртка",
    });

    const stored = await dbClient
      .requirePool()
      .query<{ status: string; shop_id: number }>(
        "SELECT status, shop_id FROM products WHERE id = $1",
        [product.id],
      );
    expect(stored.rows).toEqual([{ status: "published", shop_id: shop.id }]);
    expect(await countRows("otp_codes")).toBe(1);
  });

  it("keeps a second seller out of the first seller's shop and product", async () => {
    const first = await login(FIRST_PHONE);
    const firstShop = await createShop(first, {
      name: "Винтаж на районе",
      slug: FIRST_SHOP_SLUG,
      description: "Секонд-хенд и винтаж",
    });
    await publishShop(first);
    const firstProduct = await createProduct(first, {
      name: "Куртка 90-х",
      description: "Винтажная джинсовая куртка",
      priceKopecks: 420_000,
    });
    await publishProduct(first, firstProduct.id);

    const firstCard = {
      id: firstProduct.id,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      imageUrl: null,
      shop: { slug: FIRST_SHOP_SLUG, name: "Винтаж на районе" },
    };

    const second = await login(SECOND_PHONE);
    expect(second.user.id).not.toBe(first.user.id);

    const secondShop = await createShop(second, {
      name: "Второй магазин",
      slug: SECOND_SHOP_SLUG,
    });
    expect(secondShop.id).not.toBe(firstShop.id);
    expect(secondShop.status).toBe("draft");

    await publishShop(second);
    const renameOwn = await request("PATCH", "/seller/shop", second.cookie, {
      name: "Второй изменён",
    });
    expect(renameOwn.statusCode).toBe(200);
    expect(renameOwn.json()).toEqual({
      shop: expect.objectContaining({ slug: SECOND_SHOP_SLUG, name: "Второй изменён" }),
    });

    const firstShopView = await request("GET", "/seller/shop", first.cookie);
    expect(firstShopView.json()).toEqual({
      shop: {
        id: firstShop.id,
        slug: FIRST_SHOP_SLUG,
        name: "Винтаж на районе",
        description: "Секонд-хенд и винтаж",
        status: "published",
      },
    });

    const secondShopPage = await app.inject({
      method: "GET",
      url: `/shops/${SECOND_SHOP_SLUG}`,
    });
    expect(secondShopPage.json()).toEqual({
      slug: SECOND_SHOP_SLUG,
      name: "Второй изменён",
      description: null,
      products: [],
    });

    const foreignShopView = await app.inject({ method: "GET", url: `/shops/${FIRST_SHOP_SLUG}` });
    expect(foreignShopView.statusCode).toBe(200);
    expect(foreignShopView.json()).toEqual({
      slug: FIRST_SHOP_SLUG,
      name: "Винтаж на районе",
      description: "Секонд-хенд и винтаж",
      products: [firstCard],
    });

    const foreignUpdate = await request(
      "PATCH",
      `/seller/products/${firstProduct.id}`,
      second.cookie,
      { name: "Изменено чужим", status: "hidden" },
    );
    expect(foreignUpdate.statusCode).toBe(404);
    expect(foreignUpdate.json()).toEqual({ error: "not_found" });

    const firstProducts = await request("GET", "/seller/products", first.cookie);
    expect(firstProducts.json()).toEqual({
      products: [{ ...firstProduct, status: "published" }],
    });

    const secondProducts = await request("GET", "/seller/products", second.cookie);
    expect(secondProducts.json()).toEqual({ products: [] });

    const publicProduct = await app.inject({
      method: "GET",
      url: `/products/${firstProduct.id}`,
    });
    expect(publicProduct.statusCode).toBe(200);
    expect(publicProduct.json()).toEqual({
      ...firstCard,
      description: "Винтажная джинсовая куртка",
    });

    const stored = await dbClient
      .requirePool()
      .query<{ name: string; status: string; shop_id: number }>(
        "SELECT name, status, shop_id FROM products WHERE id = $1",
        [firstProduct.id],
      );
    expect(stored.rows).toEqual([
      { name: "Куртка 90-х", status: "published", shop_id: firstShop.id },
    ]);
  });

  it("returns 401 on every protected route without a session", async () => {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/seller/shop" }),
      app.inject({
        method: "POST",
        url: "/seller/shop",
        payload: { name: "Магазин", slug: "no-session-shop" },
      }),
      app.inject({ method: "PATCH", url: "/seller/shop", payload: { name: "Магазин" } }),
      app.inject({ method: "GET", url: "/seller/products" }),
      app.inject({
        method: "POST",
        url: "/seller/products",
        payload: { name: "Куртка", priceKopecks: 1000 },
      }),
      app.inject({ method: "PATCH", url: "/seller/products/1", payload: { name: "Куртка" } }),
      app.inject({ method: "GET", url: "/auth/me" }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    }

    const rows = await dbClient
      .requirePool()
      .query<{ shops: number; products: number; users: number }>(
        "SELECT (SELECT count(*)::int FROM shops) AS shops, (SELECT count(*)::int FROM products) AS products, (SELECT count(*)::int FROM users) AS users",
      );
    expect(rows.rows[0]).toEqual({ shops: 0, products: 0, users: 0 });
  });
});
