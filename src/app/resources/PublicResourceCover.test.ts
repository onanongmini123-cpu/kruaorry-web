import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicResourceCover } from "./PublicResourceCover";

describe("PublicResourceCover", () => {
  it("renders a lazy, non-stretched real cover with useful alternative text", () => {
    const html = renderToStaticMarkup(React.createElement(PublicResourceCover, {
      title: "โรงงานคำไทย",
      url: "https://cdn.example.org/thai-words.webp",
      deliveryMode: "web_app",
      fallback: "neutral",
    }));

    expect(html).toContain('src="https://cdn.example.org/thai-words.webp"');
    expect(html).toContain('alt="ภาพปก โรงงานคำไทย"');
    expect(html).toContain('loading="lazy"');
    expect(html).toMatch(/object-fit:\s*cover/);
  });

  it("uses the neutral brand placeholder instead of a game icon when no cover exists", () => {
    const html = renderToStaticMarkup(React.createElement(PublicResourceCover, {
      title: "สื่อไม่มีภาพปก",
      url: null,
      deliveryMode: "web_app",
      fallback: "neutral",
    }));

    expect(html).toContain("lucide-image");
    expect(html).not.toContain("lucide-gamepad-2");
    expect(html).toContain('aria-label="ภาพประกอบ สื่อไม่มีภาพปก"');
  });

  it("switches a broken configured image to the fallback path", () => {
    const source = readFileSync(new URL("./PublicResourceCover.tsx", import.meta.url), "utf8");
    expect(source).toContain("onError={() => setFailedUrl(url)}");
    expect(source).toContain("failedUrl !== url");
  });
});
