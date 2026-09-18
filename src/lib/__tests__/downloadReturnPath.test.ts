import { describe, expect, it } from "vitest";
import { downloadLoginHref, downloadReturnPath } from "../downloadReturnPath";

describe("download post-login return path", () => {
  const id = "8f45a410-1fb0-40fe-bacf-2b24612668b2";

  it("keeps a bare resource download on the same origin", () => {
    expect(downloadReturnPath(id)).toBe(`/download/${id}`);
    expect(downloadLoginHref(id)).toBe(`/login?next=%2Fdownload%2F${id}`);
  });

  it("preserves the file name and popup auto-close marker through login", () => {
    const href = downloadLoginHref(id, "ใบงาน ป.1.pdf", true);
    const loginUrl = new URL(href, "https://kruaorry.example");
    expect(loginUrl.pathname).toBe("/login");
    const next = new URL(loginUrl.searchParams.get("next")!, "https://kruaorry.example");
    expect(next.pathname).toBe(`/download/${id}`);
    expect(next.searchParams.get("name")).toBe("ใบงาน ป.1.pdf");
    expect(next.searchParams.get("autoclose")).toBe("1");
  });

  it("encodes unexpected path characters rather than accepting an external redirect", () => {
    const loginUrl = new URL(downloadLoginHref("//attacker.example/<script>"), "https://kruaorry.example");
    expect(loginUrl.pathname).toBe("/login");
    expect(loginUrl.searchParams.get("next")).toBe("/download/%2F%2Fattacker.example%2F%3Cscript%3E");
  });

  it("drops a filename the login return-path validator would reject", () => {
    expect(downloadReturnPath(id, "../secret.pdf")).toBe(`/download/${id}`);
    expect(downloadReturnPath(id, "x".repeat(181))).toBe(`/download/${id}`);
  });
});
