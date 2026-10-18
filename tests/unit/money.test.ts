import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";

describe("formatMoney", () => {
  it("formats exact decimal strings with grouping and two decimals", () => {
    expect(formatMoney("0", "USD")).toBe("USD 0.00");
    expect(formatMoney("25.5", "USD")).toBe("USD 25.50");
    expect(formatMoney("1234567.89", "SOS")).toBe("SOS 1,234,567.89");
    expect(formatMoney("9999999999.99", "USD")).toBe("USD 9,999,999,999.99");
  });
});
