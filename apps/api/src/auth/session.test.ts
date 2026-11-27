import { describe, expect, it } from "vitest";
import { readSessionUserId, sessionCookieOptions } from "./session.js";

describe("sessionCookieOptions", () => {
  it("marks the cookie httpOnly, lax and secure only in production", () => {
    const development = sessionCookieOptions("development");
    expect(development).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });

    const production = sessionCookieOptions("production");
    expect(production.secure).toBe(true);
    expect(production.maxAge).toBe(7 * 24 * 60 * 60);
  });
});

describe("readSessionUserId", () => {
  it("reads a positive integer subject", () => {
    expect(readSessionUserId({ sub: 7 })).toBe(7);
    expect(readSessionUserId({ sub: "7" })).toBe(7);
  });

  it("rejects malformed subjects", () => {
    expect(readSessionUserId({ sub: 0 })).toBeNull();
    expect(readSessionUserId({ sub: -1 })).toBeNull();
    expect(readSessionUserId({ sub: "seven" })).toBeNull();
    expect(readSessionUserId({})).toBeNull();
    expect(readSessionUserId(null)).toBeNull();
    expect(readSessionUserId("token")).toBeNull();
  });
});
