import { describe, expect, test, vi } from "bun:test";

import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  test("allows up to the limit per key and then rejects", () => {
    const limiter = createRateLimiter(2, 1_000);
    expect(limiter.allow("1.2.3.4")).toBe(true);
    expect(limiter.allow("1.2.3.4")).toBe(true);
    expect(limiter.allow("1.2.3.4")).toBe(false);
  });

  test("tracks keys independently", () => {
    const limiter = createRateLimiter(1, 1_000);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  test("releases the budget once the window elapses", () => {
    vi.useFakeTimers();
    try {
      const limiter = createRateLimiter(1, 20);
      expect(limiter.allow("key")).toBe(true);
      expect(limiter.allow("key")).toBe(false);
      vi.advanceTimersByTime(30);
      expect(limiter.allow("key")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
