/**
 * In-memory sliding window rate limiter.
 * NOTE: This is per-server-instance only and suitable for single-node / development.
 * Before multi-instance production deployment, this must be migrated to a shared store
 * such as Redis / Upstash Redis. Documented in docs/decisions.md.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const store = new Map<string, RateLimitRecord>();

// Cleanup stale keys every 5 minutes to prevent memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const currentTime = Date.now();
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => currentTime - ts < 3600 * 1000);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const record = store.get(key) || { timestamps: [] };

  // Filter out timestamps outside the sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
    };
  }

  record.timestamps.push(now);
  store.set(key, record);

  return {
    allowed: true,
    remaining: limit - record.timestamps.length,
    retryAfterMs: 0,
  };
}

export function resetRateLimits(): void {
  store.clear();
}
