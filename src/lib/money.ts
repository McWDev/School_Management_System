/**
 * Format a decimal amount string (from a numeric column) for display, e.g.
 * ("1234.5", "USD") → "USD 1,234.50". Works on the digits as text, so money
 * never passes through a floating-point number.
 */
export function formatMoney(amount: string, currencyCode: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) return `${currencyCode} ${amount}`;
  const [, sign, whole, fraction = ""] = match;
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = fraction.padEnd(2, "0").slice(0, 2);
  return `${sign}${currencyCode} ${grouped}.${cents}`;
}
