import { describe, expect, it } from "vitest";
import { formatMoney, fromCents, sumMoney, toCents } from "@/lib/money";

describe("money", () => {
  it("formats exact decimal strings with grouping and two decimals", () => {
    expect(formatMoney("0", "USD")).toBe("USD 0.00");
    expect(formatMoney("25.5", "USD")).toBe("USD 25.50");
    expect(formatMoney("1234567.89", "SOS")).toBe("SOS 1,234,567.89");
    expect(formatMoney("9999999999.99", "USD")).toBe("USD 9,999,999,999.99");
  });

  it("adds amounts exactly in cents", () => {
    // 0.1 + 0.2 is not 0.3 in floating point; in cents it is.
    expect(sumMoney(["0.1", "0.2"])).toBe("0.30");
    expect(sumMoney(["9999999999.99", "0.01"])).toBe("10000000000.00");
    expect(sumMoney([])).toBe("0.00");
    expect(fromCents(toCents("50") - toCents("20.25"))).toBe("29.75");
    expect(fromCents(toCents("-1.5"))).toBe("-1.50");
    expect(() => toCents("1.234")).toThrow();
  });
});
