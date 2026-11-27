import { describe, expect, it } from "vitest";
import { createTokenBucket } from "./rate-limiter.js";

describe("outbound token bucket", () => {
  it("allows a burst up to capacity and then rejects", () => {
    const bucket = createTokenBucket({ capacity: 3, refillPerSecond: 1 });
    const now = 1_000;

    expect(bucket.tryAcquire(now)).toBe(true);
    expect(bucket.tryAcquire(now)).toBe(true);
    expect(bucket.tryAcquire(now)).toBe(true);
    expect(bucket.tryAcquire(now)).toBe(false);
  });

  it("refills at the configured rate without exceeding capacity", () => {
    const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 1 });
    const now = 1_000;

    expect(bucket.tryAcquire(now)).toBe(true);
    expect(bucket.tryAcquire(now)).toBe(true);
    expect(bucket.tryAcquire(now + 500)).toBe(false);
    expect(bucket.tryAcquire(now + 1_000)).toBe(true);
    expect(bucket.tryAcquire(now + 60_000)).toBe(true);
    expect(bucket.tryAcquire(now + 60_000)).toBe(true);
    expect(bucket.tryAcquire(now + 60_000)).toBe(false);
  });

  it("rejects invalid limits", () => {
    expect(() => createTokenBucket({ capacity: 0, refillPerSecond: 1 })).toThrow();
    expect(() => createTokenBucket({ capacity: 1, refillPerSecond: 0 })).toThrow();
  });
});
