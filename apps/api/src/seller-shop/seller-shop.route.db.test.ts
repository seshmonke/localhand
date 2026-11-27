import { reservedShopSlugs } from "@localhand/shared";
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

async function countRows(table: "users" | "sellers" | "shops"): Promise<number> {
  const result = await dbClient
    .requirePool()
    .query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
  return result.rows[0]?.count ?? 0;
}

describeWithDb("seller shop routes with a real database", () => {
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

  it("returns a null shop before onboarding", async () => {
    const user = await createUser(1);

    const response = await request(user, "GET", "/seller/shop");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ shop: null });
  });

  it("creates a draft shop and a seller on the first POST", async () => {
    const user = await createUser(1);

    const response = await request(user, "POST", "/seller/shop", {
      name: "Винтаж на районе",
      slug: "vintage-shop",
      description: "Секонд-хенд и винтаж",
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      shop: {
        id: expect.any(Number),
        slug: "vintage-shop",
        name: "Винтаж на районе",
        description: "Секонд-хенд и винтаж",
        cdekCityCode: null,
        cdekCityName: null,
        cdekShipmentPoint: null,
        status: "draft",
      },
    });
    expect(body.shop).not.toHaveProperty("createdAt");

    const sellers = await dbClient
      .requirePool()
      .query<{ display_name: string; user_id: number }>(
        "SELECT display_name, user_id FROM sellers",
      );
    expect(sellers.rows).toEqual([{ display_name: "Винтаж на районе", user_id: user.id }]);

    const read = await request(user, "GET", "/seller/shop");
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(body);
  });

  it("reuses an existing seller that has no shop yet", async () => {
    const user = await createUser(2);
    await dbClient
      .requirePool()
      .query("INSERT INTO sellers (display_name, user_id) VALUES ($1, $2)", [
        "Старое имя",
        user.id,
      ]);

    const response = await request(user, "POST", "/seller/shop", {
      name: "Новый магазин",
      slug: "new-shop",
    });

    expect(response.statusCode).toBe(201);
    expect(await countRows("sellers")).toBe(1);
    expect(await countRows("shops")).toBe(1);

    const seller = await dbClient
      .requirePool()
      .query<{ display_name: string }>("SELECT display_name FROM sellers");
    expect(seller.rows[0]?.display_name).toBe("Старое имя");
  });

  it("rejects a second shop for the same seller", async () => {
    const user = await createUser(3);
    await request(user, "POST", "/seller/shop", { name: "Первый", slug: "first-shop" });

    const response = await request(user, "POST", "/seller/shop", {
      name: "Второй",
      slug: "second-shop",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "shop_exists" });
    expect(await countRows("shops")).toBe(1);
  });

  it("rejects a slug taken by another seller and rolls the transaction back", async () => {
    const first = await createUser(4);
    const second = await createUser(5);
    await request(first, "POST", "/seller/shop", { name: "Первый", slug: "shared-shop" });

    const response = await request(second, "POST", "/seller/shop", {
      name: "Второй",
      slug: "shared-shop",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "slug_taken" });
    expect(await countRows("shops")).toBe(1);

    const sellers = await dbClient
      .requirePool()
      .query<{ count: number }>("SELECT count(*)::int AS count FROM sellers WHERE user_id = $1", [
        second.id,
      ]);
    expect(sellers.rows[0]?.count).toBe(0);

    const ownShop = await request(second, "GET", "/seller/shop");
    expect(ownShop.json()).toEqual({ shop: null });
  });

  it("rejects invalid, malformed and reserved slugs with 400", async () => {
    const user = await createUser(6);
    const invalidPayloads: Array<Record<string, unknown>> = [
      { name: "Магазин", slug: "ab" },
      { name: "Магазин", slug: "a".repeat(41) },
      { name: "Магазин", slug: "UPPER" },
      { name: "Магазин", slug: "-shop" },
      { name: "Магазин", slug: "shop-" },
      { name: "Магазин", slug: "shop_name" },
      { name: "Магазин", slug: "shop name" },
      { name: "Магазин" },
      { name: "   ", slug: "valid-shop" },
      { name: "Магазин", slug: "valid-shop", description: "a".repeat(2001) },
      ...reservedShopSlugs.map((slug) => ({ name: "Магазин", slug })),
    ];

    for (const payload of invalidPayloads) {
      const response = await request(user, "POST", "/seller/shop", payload);

      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_request" });
    }

    expect(await countRows("shops")).toBe(0);
    expect(await countRows("sellers")).toBe(0);
  });

  it("publishes the shop on the storefront and unpublishes it without losing data", async () => {
    const user = await createUser(7);
    await request(user, "POST", "/seller/shop", {
      name: "Винтаж на районе",
      slug: "storefront-shop",
      description: "Старое описание",
    });

    const draft = await app.inject({ method: "GET", url: "/shops/storefront-shop" });
    expect(draft.statusCode).toBe(404);

    const published = await request(user, "PATCH", "/seller/shop", { status: "published" });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toEqual({
      shop: expect.objectContaining({ slug: "storefront-shop", status: "published" }),
    });

    const publicShop = await app.inject({ method: "GET", url: "/shops/storefront-shop" });
    expect(publicShop.statusCode).toBe(200);
    expect(publicShop.json()).toEqual({
      slug: "storefront-shop",
      name: "Винтаж на районе",
      description: "Старое описание",
      products: [],
    });

    const unpublished = await request(user, "PATCH", "/seller/shop", {
      name: "Новое имя",
      description: null,
      status: "draft",
    });
    expect(unpublished.statusCode).toBe(200);
    expect(unpublished.json()).toEqual({
      shop: expect.objectContaining({
        name: "Новое имя",
        description: null,
        status: "draft",
      }),
    });

    const hidden = await app.inject({ method: "GET", url: "/shops/storefront-shop" });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual({ error: "not_found" });

    const stored = await request(user, "GET", "/seller/shop");
    expect(stored.json()).toEqual({
      shop: expect.objectContaining({
        name: "Новое имя",
        description: null,
        status: "draft",
      }),
    });
  });

  it("rejects the platform-only blocked status on PATCH", async () => {
    const user = await createUser(8);
    await request(user, "POST", "/seller/shop", { name: "Магазин", slug: "blocked-shop" });

    const response = await request(user, "PATCH", "/seller/shop", { status: "blocked" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });

    const stored = await request(user, "GET", "/seller/shop");
    expect(stored.json()).toEqual({ shop: expect.objectContaining({ status: "draft" }) });
  });

  it("does not let a seller edit a platform-blocked shop", async () => {
    const user = await createUser(14);
    await request(user, "POST", "/seller/shop", {
      name: "Заблокированный магазин",
      slug: "blocked-shop",
    });
    await dbClient
      .requirePool()
      .query("UPDATE shops SET status = 'blocked' WHERE slug = $1", ["blocked-shop"]);

    const rename = await request(user, "PATCH", "/seller/shop", { name: "Обход блокировки" });
    expect(rename.statusCode).toBe(409);
    expect(rename.json()).toEqual({ error: "shop_blocked" });

    const publish = await request(user, "PATCH", "/seller/shop", { status: "published" });
    expect(publish.statusCode).toBe(409);
    expect(publish.json()).toEqual({ error: "shop_blocked" });

    const stored = await request(user, "GET", "/seller/shop");
    expect(stored.json()).toEqual({
      shop: expect.objectContaining({
        name: "Заблокированный магазин",
        slug: "blocked-shop",
        status: "blocked",
      }),
    });

    const storefront = await app.inject({ method: "GET", url: "/shops/blocked-shop" });
    expect(storefront.statusCode).toBe(404);
  });

  it("changes the public slug and serves a published shop under the new slug", async () => {
    const user = await createUser(15);
    await request(user, "POST", "/seller/shop", { name: "Магазин со сменой", slug: "old-slug" });
    await request(user, "PATCH", "/seller/shop", { status: "published" });

    const oldPublished = await app.inject({ method: "GET", url: "/shops/old-slug" });
    expect(oldPublished.statusCode).toBe(200);

    const response = await request(user, "PATCH", "/seller/shop", { slug: "new-slug" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      shop: expect.objectContaining({ slug: "new-slug", status: "published" }),
    });

    const stored = await request(user, "GET", "/seller/shop");
    expect(stored.json()).toEqual({ shop: expect.objectContaining({ slug: "new-slug" }) });

    const oldUrl = await app.inject({ method: "GET", url: "/shops/old-slug" });
    expect(oldUrl.statusCode).toBe(404);

    const newUrl = await app.inject({ method: "GET", url: "/shops/new-slug" });
    expect(newUrl.statusCode).toBe(200);
    expect(newUrl.json()).toEqual({
      slug: "new-slug",
      name: "Магазин со сменой",
      description: null,
      products: [],
    });
  });

  it("returns 404 on PATCH when the seller has no shop", async () => {
    const user = await createUser(9);

    const response = await request(user, "PATCH", "/seller/shop", { name: "Новое имя" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "not_found" });
  });

  it("rejects an empty PATCH and a slug taken by another seller", async () => {
    const first = await createUser(10);
    const second = await createUser(11);
    await request(first, "POST", "/seller/shop", { name: "Первый", slug: "first-taken" });
    await request(second, "POST", "/seller/shop", { name: "Второй", slug: "second-shop" });

    const empty = await request(second, "PATCH", "/seller/shop", {});
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toEqual({ error: "invalid_request" });

    const taken = await request(second, "PATCH", "/seller/shop", { slug: "first-taken" });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: "slug_taken" });

    const stored = await request(second, "GET", "/seller/shop");
    expect(stored.json()).toEqual({ shop: expect.objectContaining({ slug: "second-shop" }) });
  });

  it("isolates shops between two sellers with separate sessions", async () => {
    const first = await createUser(12);
    const second = await createUser(13);
    await request(first, "POST", "/seller/shop", {
      name: "Первый магазин",
      slug: "first-shop",
    });

    const notFound = await request(second, "PATCH", "/seller/shop", { name: "Взлом" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "not_found" });

    await request(second, "POST", "/seller/shop", { name: "Второй магазин", slug: "second-shop" });
    const update = await request(second, "PATCH", "/seller/shop", { name: "Второй изменён" });
    expect(update.statusCode).toBe(200);

    const firstShop = await request(first, "GET", "/seller/shop");
    expect(firstShop.json()).toEqual({
      shop: expect.objectContaining({
        id: 1,
        slug: "first-shop",
        name: "Первый магазин",
        status: "draft",
      }),
    });

    const secondShop = await request(second, "GET", "/seller/shop");
    expect(secondShop.json()).toEqual({
      shop: expect.objectContaining({
        id: 2,
        slug: "second-shop",
        name: "Второй изменён",
      }),
    });
  });

  it("stores the CDEK origin city and point atomically and clears old points", async () => {
    const user = await createUser(1);
    const created = await request(user, "POST", "/seller/shop", {
      name: "Магазин с доставкой",
      slug: "shipping-shop",
    });
    expect(created.statusCode).toBe(201);

    const first = await request(user, "PATCH", "/seller/shop", {
      cdekCityCode: 44,
      cdekCityName: "Москва",
      cdekShipmentPoint: "MSK001",
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().shop).toMatchObject({
      cdekCityCode: 44,
      cdekCityName: "Москва",
      cdekShipmentPoint: "MSK001",
    });

    const sameCityNewPoint = await request(user, "PATCH", "/seller/shop", {
      cdekShipmentPoint: "MSK002",
    });
    expect(sameCityNewPoint.statusCode).toBe(200);
    expect(sameCityNewPoint.json().shop).toMatchObject({
      cdekCityCode: 44,
      cdekShipmentPoint: "MSK002",
    });

    const newCity = await request(user, "PATCH", "/seller/shop", {
      cdekCityCode: 137,
      cdekCityName: "Санкт-Петербург",
    });
    expect(newCity.statusCode).toBe(200);
    expect(newCity.json().shop).toMatchObject({
      cdekCityCode: 137,
      cdekCityName: "Санкт-Петербург",
      cdekShipmentPoint: null,
    });

    const pointWithoutCity = await request(user, "PATCH", "/seller/shop", {
      cdekCityCode: null,
    });
    expect(pointWithoutCity.statusCode).toBe(200);
    expect(pointWithoutCity.json().shop).toMatchObject({
      cdekCityCode: null,
      cdekCityName: null,
      cdekShipmentPoint: null,
    });

    const missingCity = await request(user, "PATCH", "/seller/shop", {
      cdekShipmentPoint: "MSK001",
    });
    expect(missingCity.statusCode).toBe(409);
    expect(missingCity.json()).toEqual({ error: "shop_city_missing" });
  });

  it("returns 401 for missing, malformed and expired sessions", async () => {
    const expired = app.jwt.sign({ sub: 1 }, { expiresIn: -1 });
    const unknownUser = app.jwt.sign({ sub: 999 });
    const cookies = [undefined, "not-a-jwt", expired, unknownUser];

    for (const method of ["GET", "POST", "PATCH"] as const) {
      for (const token of cookies) {
        const headers: Record<string, string> = token
          ? { cookie: `${SESSION_COOKIE_NAME}=${token}` }
          : {};
        const response = await app.inject({
          method,
          url: "/seller/shop",
          headers,
          ...(method === "GET" ? {} : { payload: {} }),
        });

        expect(response.statusCode, `${method} ${String(token)}`).toBe(401);
        expect(response.json()).toEqual({ error: "unauthorized" });
      }
    }

    expect(await countRows("shops")).toBe(0);
  });
});
