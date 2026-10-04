import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  it("is a labelled home link with a decorative mascot", () => {
    const markup = renderToStaticMarkup(React.createElement(BrandLogo, { mascotSize: 96 }));

    expect(markup).toContain('href="/"');
    expect(markup).toContain('aria-label="กลับหน้าแรก KruAorry"');
    expect(markup).toContain('alt=""');
    expect(markup).toContain("KruAorry");
  });
});
