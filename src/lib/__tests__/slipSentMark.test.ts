import { describe, expect, it } from "vitest";
import { readSlipSent, writeSlipSent, type SlipStorage } from "../slipSentMark";

function memoryStorage(): SlipStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const broken: SlipStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("quota"); },
  removeItem: () => { throw new Error("blocked"); },
};

describe("slip-sent mark (this browser only)", () => {
  it("is remembered per reference code", () => {
    const storage = memoryStorage();
    expect(readSlipSent("KA-00000005", storage)).toBe(false);
    writeSlipSent("KA-00000005", true, storage);
    expect(readSlipSent("KA-00000005", storage)).toBe(true);
    expect(readSlipSent("KA-00000006", storage)).toBe(false);
  });

  it("can be cleared again (the member says the slip was not sent)", () => {
    const storage = memoryStorage();
    writeSlipSent("KA-00000005", true, storage);
    writeSlipSent("KA-00000005", false, storage);
    expect(readSlipSent("KA-00000005", storage)).toBe(false);
    expect(storage.data.size).toBe(0);
  });

  it("never throws when storage is blocked or full: the page just opens on step 2", () => {
    expect(readSlipSent("KA-00000005", broken)).toBe(false);
    expect(() => writeSlipSent("KA-00000005", true, broken)).not.toThrow();
    expect(() => writeSlipSent("KA-00000005", false, broken)).not.toThrow();
    expect(readSlipSent("KA-00000005", null)).toBe(false);
    expect(() => writeSlipSent("KA-00000005", true, null)).not.toThrow();
  });

  it("ignores reference codes that are not plain codes, so a key cannot be forged", () => {
    const storage = memoryStorage();
    writeSlipSent("../../x y", true, storage);
    writeSlipSent("", true, storage);
    expect(storage.data.size).toBe(0);
    expect(readSlipSent("../../x y", storage)).toBe(false);
  });
});
