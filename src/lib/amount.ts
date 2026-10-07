const U64_MAX = 18446744073709551615n;

/** Parse decimal input without floating point rounding or silent truncation. */
export function parseAmount(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9)
    throw new Error("Unsupported token decimals.");
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Enter a positive decimal amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`This token supports ${decimals} decimal places.`);
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (amount <= 0n || amount > U64_MAX) throw new Error("Amount is outside the token program limit.");
  return amount;
}

export function formatAmount(amount: bigint, decimals: number): string {
  const digits = amount.toString().padStart(decimals + 1, "0");
  if (!decimals) return digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return digits.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}
