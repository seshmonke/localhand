import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Shared setup for the browser e2e. The stack under test is expected to be
 * already running (`pnpm dev`, see `apps/web/e2e/README.md`); every fixture is
 * created through the public API with the dev OTP provider, so the tests do not
 * depend on a seeded database.
 */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
export const SESSION_COOKIE_NAME = "lh_session";
export const CART_STORAGE_KEY = "localhand.cart.v1";
export const CART_VERSION = 1;

let sequence = 0;

export function uniqueSuffix(): string {
  sequence += 1;
  return `${Date.now().toString(36)}${sequence}`.toLowerCase();
}

/** Fake Russian mobile number: +7 999 XXXXXXX. Never a real subscriber. */
export function uniquePhone(): string {
  sequence += 1;
  const tail = `${String(Date.now()).slice(-6)}${String(sequence % 10)}`;
  return `+7999${tail}`;
}

export type ApiSession = {
  cookie: string;
  phone: string;
};

export type CatalogProduct = {
  id: number;
  name: string;
  priceKopecks: number;
};

export type CatalogFixture = {
  seller: ApiSession;
  shop: { slug: string; name: string };
  products: CatalogProduct[];
};

export type CartState = {
  version: typeof CART_VERSION;
  items: Array<{
    productId: number;
    name: string;
    priceKopecks: number;
    imageUrl: string | null;
    shopSlug: string;
    shopName: string;
  }>;
};

async function requestDevCode(request: APIRequestContext, phone: string): Promise<string> {
  const response = await request.post("/api/auth/request-code", { data: { phone } });
  expect(response.ok(), "request-code must succeed").toBeTruthy();
  const payload = (await response.json()) as { devCode?: string };
  expect(payload.devCode, "dev SMS provider must return a code").toMatch(/^\d{6}$/);
  if (!payload.devCode) {
    throw new Error("dev SMS provider did not return a code");
  }
  return payload.devCode;
}

export async function loginViaApi(
  request: APIRequestContext,
  phone = uniquePhone(),
): Promise<ApiSession> {
  const code = await requestDevCode(request, phone);
  const response = await request.post("/api/auth/verify-code", { data: { phone, code } });
  expect(response.ok(), "verify-code must succeed").toBeTruthy();

  const setCookie = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value)
    .join("\n");
  const token = new RegExp(`${SESSION_COOKIE_NAME}=([^;\\n]+)`).exec(setCookie)?.[1];
  if (!token) {
    throw new Error("verify-code did not set the session cookie");
  }

  return { cookie: `${SESSION_COOKIE_NAME}=${token}`, phone };
}

export async function createPublishedCatalog(
  request: APIRequestContext,
  productNames: string[] = ["E2E Куртка", "E2E Шарф"],
): Promise<CatalogFixture> {
  const suffix = uniqueSuffix();
  const seller = await loginViaApi(request);
  const shopName = `E2E магазин ${suffix}`;
  const shopSlug = `e2e-${suffix}`.slice(0, 40);

  const shopResponse = await request.post("/api/seller/shop", {
    headers: { cookie: seller.cookie },
    data: { name: shopName, slug: shopSlug, description: "Магазин для e2e" },
  });
  expect(shopResponse.status(), await shopResponse.text()).toBe(201);

  const publishResponse = await request.patch("/api/seller/shop", {
    headers: { cookie: seller.cookie },
    data: { status: "published" },
  });
  expect(publishResponse.status(), await publishResponse.text()).toBe(200);

  const products: CatalogProduct[] = [];
  for (const [index, baseName] of productNames.entries()) {
    const name = `${baseName} ${suffix}`;
    const priceKopecks = 100_000 + index * 50_000;

    const created = await request.post("/api/seller/products", {
      headers: { cookie: seller.cookie },
      data: { name, priceKopecks, description: "Товар для e2e" },
    });
    expect(created.status(), await created.text()).toBe(201);
    const product = (await created.json()) as { product: { id: number } };

    const published = await request.patch(`/api/seller/products/${product.product.id}`, {
      headers: { cookie: seller.cookie },
      data: { status: "published" },
    });
    expect(published.status(), await published.text()).toBe(200);

    products.push({ id: product.product.id, name, priceKopecks });
  }

  return { seller, shop: { slug: shopSlug, name: shopName }, products };
}

export function cartStateFor(catalog: CatalogFixture): CartState {
  return {
    version: CART_VERSION,
    items: catalog.products.map((product) => ({
      productId: product.id,
      name: product.name,
      priceKopecks: product.priceKopecks,
      imageUrl: null,
      shopSlug: catalog.shop.slug,
      shopName: catalog.shop.name,
    })),
  };
}

/** Places the API session cookie and (optionally) the localStorage cart. */
export async function seedBrowserSession(
  context: BrowserContext,
  session: ApiSession,
  cart: CartState | null,
): Promise<void> {
  const token = session.cookie.slice(`${SESSION_COOKIE_NAME}=`.length);
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  if (cart) {
    await context.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, JSON.stringify(value));
      },
      { key: CART_STORAGE_KEY, value: cart },
    );
  }
}

/** Logs in through the real login form and waits for the post-login page. */
export async function loginViaUi(page: Page, phone: string): Promise<void> {
  await page.getByLabel("Телефон").fill(phone);
  await page.getByRole("button", { name: "Получить код" }).click();

  const devCode = (
    await page.locator("output").filter({ hasText: "Код из SMS" }).locator("strong").innerText()
  ).trim();
  expect(devCode).toMatch(/^\d{6}$/);

  await page.getByLabel("Код из сообщения").fill(devCode);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}

export async function waitForStablePage(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
}
