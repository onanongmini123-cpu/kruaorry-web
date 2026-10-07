import { describe, expect, it } from "vitest";
import { htmlErrorPage } from "../htmlErrorPage";

async function render(...args: Parameters<typeof htmlErrorPage>) {
  const response = htmlErrorPage(...args);
  return { response, html: await response.text() };
}

describe("friendly error page", () => {
  it("is never cached, never indexed, and leaks no referrer", async () => {
    const { response, html } = await render(403, "เปิดสื่อไม่ได้", "ต้องมีสิทธิ์ก่อน");
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain('<meta name="robots" content="noindex" />');
  });

  it("escapes everything it is given", async () => {
    const { html } = await render(500, '<script>alert("x")</script>', "a & b < c > d \"q\"", { href: "/ok", label: '"><img src=x onerror=alert(1)>' });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b &lt; c &gt; d &quot;q&quot;");
  });

  it("offers the member app by default and keeps a path on this site", async () => {
    expect((await render(404, "h", "m")).html).toContain('<a href="/app">กลับไปที่แอป</a>');
    expect((await render(403, "h", "m", { href: "/resources/sentence-train", label: "ดูรายละเอียด" })).html)
      .toContain('<a href="/resources/sentence-train">ดูรายละเอียด</a>');
    expect((await render(503, "h", "m", { href: "/api/resources/abc/open?x=1", label: "ลองใหม่" })).html)
      .toContain('href="/api/resources/abc/open?x=1"');
  });

  it("never links off-site, even if a caller passes a computed value", async () => {
    for (const href of [
      "https://evil.example/steal",
      "http://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "relative/path",
      "",
      "/ok\nSet-Cookie: x=1",
      "/ok\u0000",
    ]) {
      const { html } = await render(403, "h", "m", { href, label: "go" });
      expect(html, JSON.stringify(href)).toContain('<a href="/app">go</a>');
    }
  });
});
