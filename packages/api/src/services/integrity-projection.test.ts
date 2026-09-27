import { describe, expect, test } from "bun:test";

import { projectApprovedPassport } from "./integrity";

describe("projectApprovedPassport", () => {
  const asset = {
    category: "Oven",
    brand: "AI Brand",
    model: "A1",
    serialNumber: "SN-1",
    year: 2020,
    capacity: "40 L",
    location: "Jakarta",
    previousUsage: "Restoran",
  };
  const inspection = {
    conditionScore: 75,
    grade: "B",
    damageSeverity: "medium" as const,
    damageResult: [{ kind: "rust" as const, severity: "medium" as const, area: "kaki", note: "Karat ringan" }],
    scoreComponents: { physical: 70, visual: 75, completeness: 80, overall: 75, grade: "B" },
  };

  test("uses allowlisted seller corrections without mutating AI subscores", () => {
    const projected = projectApprovedPassport({
      asset,
      inspection,
      sellerEdits: { brand: "Diperbaiki", conditionScore: 80, damageSeverity: null, damage: [] },
    });

    expect(projected).toMatchObject({ brand: "Diperbaiki", conditionScore: 80, damageSeverity: null, damage: [] });
    expect(projected.scoreComponents).toEqual(inspection.scoreComponents);
  });

  test("does not display untyped legacy edits", () => {
    const projected = projectApprovedPassport({
      asset,
      inspection,
      sellerEdits: { brand: "Diperbaiki", valueEstimate: 9_000_000, conditionScore: "tinggi" },
    });

    expect(projected.brand).toBe("Diperbaiki");
    expect(projected.conditionScore).toBe(75);
  });
});
