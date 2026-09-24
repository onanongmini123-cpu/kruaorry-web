import { describe, expect, it } from "vitest";
import { LINE_OA_URL, MESSENGER_URL } from "../config";

describe("support contact destinations", () => {
  it("uses the approved HTTPS LINE OA destination everywhere", () => {
    expect(LINE_OA_URL).toBe("https://lin.ee/wPYMzWl");
    expect(new URL(LINE_OA_URL).protocol).toBe("https:");
  });

  it("uses the approved HTTPS Messenger destination", () => {
    expect(MESSENGER_URL).toBe("https://m.me/100354812953502");
    expect(new URL(MESSENGER_URL).protocol).toBe("https:");
  });
});
