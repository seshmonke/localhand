import type { AppNodeEnv } from "../env.js";

export const SESSION_COOKIE_NAME = "lh_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function sessionCookieOptions(nodeEnv: AppNodeEnv) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: nodeEnv === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function readSessionUserId(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const sub = (payload as { sub?: unknown }).sub;
  if (typeof sub === "number" && Number.isInteger(sub) && sub > 0) {
    return sub;
  }
  if (typeof sub === "string" && /^\d+$/.test(sub)) {
    const parsed = Number(sub);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}
