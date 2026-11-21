// Bank transfer details for the membership payment step.
//
// BANK_NAME, BANK_ACCOUNT_NUMBER and BANK_ACCOUNT_NAME are SERVER-ONLY
// environment variables (never NEXT_PUBLIC_), so they are not in any browser
// bundle. Only the route handler at /api/membership/bank-account imports this
// file, and it reveals the account only after it has confirmed that the
// application belongs to the signed-in caller and is still pending.

export interface BankAccountConfig {
  bankName: string;
  /** As the owner typed it (may contain spaces or dashes) for display. */
  accountNumber: string;
  accountName: string;
}

const clean = (value: string | undefined): string =>
  (value ?? "").replace(/[\u0000-\u001f\u007f​-‍﻿]/g, "").replace(/\s+/g, " ").trim();

/**
 * All three values must be present and look sane, otherwise the bank account
 * is treated as "not configured" and nothing is revealed. A half-filled
 * configuration must never show an account number without its name.
 */
export function readBankAccountConfig(env: Record<string, string | undefined> = process.env): BankAccountConfig | null {
  const bankName = clean(env.BANK_NAME);
  const accountNumber = clean(env.BANK_ACCOUNT_NUMBER);
  const accountName = clean(env.BANK_ACCOUNT_NAME);
  if (!bankName || !accountNumber || !accountName) return null;
  if (bankName.length > 80 || accountName.length > 120) return null;
  // Digits with optional single spaces or dashes between groups, 8-20 digits.
  if (!/^\d(?:[ -]?\d){7,19}$/.test(accountNumber)) return null;
  return { bankName, accountNumber, accountName };
}
