import { describe, expect, it } from "vitest";
import { OneEuro } from "./filter";

describe("OneEuro", () => {
  it("pulls a single spike back toward the previous value", () => {
    const filter = new OneEuro(1, 0);
    filter.next(0, 0);
    filter.next(0, 0.05);
    const spiked = filter.next(10, 0.1);
    expect(spiked).toBeLessThan(8);
    expect(spiked).toBeGreaterThan(0);
  });
});
