import { describe, expect, test } from "bun:test";

import { PASSPORT_STATUSES } from "./enums";
import { IllegalPassportTransitionError, PASSPORT_TRANSITIONS, assertTransition, canTransition } from "./status-transitions";

describe("canTransition", () => {
  test("allows every transition listed in the map", () => {
    for (const from of PASSPORT_STATUSES) {
      for (const to of PASSPORT_TRANSITIONS[from]) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  test("rejects transitions that skip lifecycle stages", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("published", "approved")).toBe(false);
    expect(canTransition("ai_complete", "approved")).toBe(false);
    expect(canTransition("published", "published")).toBe(false);
  });
});

describe("assertTransition", () => {
  test("throws with a from-to message on an illegal jump", () => {
    expect(() => assertTransition("draft", "approved")).toThrow(IllegalPassportTransitionError);
    expect(() => assertTransition("draft", "approved")).toThrow("Transisi status tidak valid: draft → approved.");
  });

  test("does not throw on an allowed transition", () => {
    expect(() => assertTransition("approved", "published")).not.toThrow();
  });
});
