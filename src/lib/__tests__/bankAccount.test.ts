import { describe, expect, it } from "vitest";
import { accountNumberDigits } from "../accountNumberDigits";
import { readBankAccountConfig } from "../bankAccount";

const full = { BANK_NAME: "ธนาคารตัวอย่าง", BANK_ACCOUNT_NUMBER: "123-4-56789-0", BANK_ACCOUNT_NAME: "ทดสอบ ระบบ" };

describe("readBankAccountConfig", () => {
  it("returns the three values when all are present", () => {
    expect(readBankAccountConfig(full)).toEqual({ bankName: "ธนาคารตัวอย่าง", accountNumber: "123-4-56789-0", accountName: "ทดสอบ ระบบ" });
  });

  it("treats the account as not configured when any value is missing or blank", () => {
    for (const key of Object.keys(full)) {
      expect(readBankAccountConfig({ ...full, [key]: undefined })).toBeNull();
      expect(readBankAccountConfig({ ...full, [key]: "   " })).toBeNull();
    }
    expect(readBankAccountConfig({})).toBeNull();
  });

  it("rejects an account number that is not digits (placeholder or typo)", () => {
    expect(readBankAccountConfig({ ...full, BANK_ACCOUNT_NUMBER: "xxx-x-xxxxx-x" })).toBeNull();
    expect(readBankAccountConfig({ ...full, BANK_ACCOUNT_NUMBER: "12345" })).toBeNull();
    expect(readBankAccountConfig({ ...full, BANK_ACCOUNT_NUMBER: "1234567890123456789012" })).toBeNull();
  });

  it("strips control and zero-width characters pasted from chat or documents", () => {
    const config = readBankAccountConfig({ ...full, BANK_NAME: "ธนาคาร​ตัวอย่าง\n", BANK_ACCOUNT_NAME: "ทดสอบ\u0000 ระบบ" });
    expect(config?.bankName).toBe("ธนาคารตัวอย่าง");
    expect(config?.accountName).toBe("ทดสอบ ระบบ");
  });

  it("copies digits only so the number pastes into a banking app", () => {
    expect(accountNumberDigits("123-4-56789-0")).toBe("1234567890");
    expect(accountNumberDigits("123 4 56789 0")).toBe("1234567890");
  });
});
