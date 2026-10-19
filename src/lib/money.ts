/*
 * Money helpers. Amounts are exact decimal strings from numeric(12,2)
 * columns; arithmetic uses whole cents as BigInt, never floating point.
 */

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

/** "12.5" → 1250n. Throws on anything that is not a plain decimal amount. */
export function toCents(amount: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new Error(`Not a money amount: ${amount}`);
  const [, sign, whole, fraction = ""] = match;
  const cents = BigInt(whole) * HUNDRED + BigInt(fraction.padEnd(2, "0"));
  return sign ? -cents : cents;
}

/** 1250n → "12.50". */
export function fromCents(cents: bigint): string {
  const sign = cents < ZERO ? "-" : "";
  const abs = cents < ZERO ? -cents : cents;
  return `${sign}${abs / HUNDRED}.${String(abs % HUNDRED).padStart(2, "0")}`;
}

/** Sum of decimal amount strings, as a decimal string. */
export function sumMoney(amounts: string[]): string {
  return fromCents(amounts.reduce((total, a) => total + toCents(a), ZERO));
}

/**
 * Format a decimal amount string for display, e.g. ("1234.5", "USD") →
 * "USD 1,234.50". Works on the digits as text.
 */
export function formatMoney(amount: string, currencyCode: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) return `${currencyCode} ${amount}`;
  const [, sign, whole, fraction = ""] = match;
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = fraction.padEnd(2, "0").slice(0, 2);
  return `${sign}${currencyCode} ${grouped}.${cents}`;
}
