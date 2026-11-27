export type TokenBucketOptions = {
  capacity: number;
  refillPerSecond: number;
};

export type TokenBucket = {
  tryAcquire(nowMs: number): boolean;
};

/**
 * In-memory outbound token bucket. CDEK allows 200 RPS per client; the
 * limiter is process-local, so a multi-instance deployment still needs a
 * shared limiter (P3 in the threat model).
 */
export function createTokenBucket(options: TokenBucketOptions): TokenBucket {
  if (!Number.isFinite(options.capacity) || options.capacity <= 0) {
    throw new Error("capacity must be positive");
  }
  if (!Number.isFinite(options.refillPerSecond) || options.refillPerSecond <= 0) {
    throw new Error("refillPerSecond must be positive");
  }

  let tokens = options.capacity;
  let lastRefillMs = 0;

  return {
    tryAcquire(nowMs: number): boolean {
      if (lastRefillMs === 0) {
        lastRefillMs = nowMs;
      }
      const elapsedMs = Math.max(0, nowMs - lastRefillMs);
      tokens = Math.min(options.capacity, tokens + (elapsedMs / 1_000) * options.refillPerSecond);
      lastRefillMs = nowMs;

      if (tokens < 1) {
        return false;
      }
      tokens -= 1;
      return true;
    },
  };
}
