import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, resetRateLimiter } from '@/lib/ai/rateLimiter';

describe('Rate Limiter Module', () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it('permits requests within quota and reports remaining correctly', () => {
    const config = { limit: 3, windowMs: 10_000 };
    const now = 1000;

    const r1 = checkRateLimit('user-1', config, now);
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit('user-1', config, now + 100);
    expect(r2.ok).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit('user-1', config, now + 200);
    expect(r3.ok).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('rejects requests exceeding quota and calculates retryAfterSec', () => {
    const config = { limit: 2, windowMs: 10_000 };
    const now = 1000;

    checkRateLimit('user-2', config, now);
    checkRateLimit('user-2', config, now + 500);

    const blocked = checkRateLimit('user-2', config, now + 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBe(9);
  });

  it('resets quota after sliding window expiration', () => {
    const config = { limit: 1, windowMs: 5_000 };
    const now = 1000;

    const r1 = checkRateLimit('user-3', config, now);
    expect(r1.ok).toBe(true);

    const blocked = checkRateLimit('user-3', config, now + 1000);
    expect(blocked.ok).toBe(false);

    // After 6 seconds (> 5000ms window)
    const allowed = checkRateLimit('user-3', config, now + 6000);
    expect(allowed.ok).toBe(true);
  });
});
