/**
 * In-memory sliding-window rate limiter for proxied AI endpoints.
 *
 * Limitation: state lives in the memory of a single server instance. On serverless or
 * multi-instance deployments each instance enforces its own window, so this is a
 * best-effort abuse guard; put an edge/WAF or shared-store limiter in front for hard quotas.
 */

interface WindowConfig {
  limit: number;
  windowMs: number;
}

const hits = new Map<string, number[]>();
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function checkRateLimit(
  key: string,
  config: WindowConfig,
  now: number = Date.now()
): RateLimitResult {
  const windowStart = now - config.windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= config.limit) {
    const oldest = recent[0] ?? now;
    hits.set(key, recent);
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((oldest + config.windowMs - now) / 1000)),
    };
  }

  recent.push(now);
  if (!hits.has(key) && hits.size >= MAX_TRACKED_KEYS) {
    const firstKey = hits.keys().next().value;
    if (firstKey !== undefined) hits.delete(firstKey);
  }
  hits.set(key, recent);
  return { ok: true, remaining: config.limit - recent.length, retryAfterSec: 0 };
}

export function resetRateLimiter(): void {
  hits.clear();
}

/** Client identity from proxy headers; falls back to a shared bucket. */
export function clientKey(headers: Headers, route: string): string {
  const forwarded = headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'anonymous';
  return `${route}:${ip}`;
}

export function exceedsContentLength(headers: Headers, maxBytes: number): boolean {
  const raw = headers.get('content-length');
  if (!raw) return false;
  const size = Number(raw);
  return Number.isFinite(size) && size > maxBytes;
}
