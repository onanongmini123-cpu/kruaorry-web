import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

const render = (props: React.ComponentProps<typeof Button>) =>
  renderToStaticMarkup(React.createElement(Button, props, "ส่งรายงาน"));

describe("Button busy and disabled states", () => {
  it("stays focusable while busy: aria-disabled and aria-busy instead of the disabled attribute", () => {
    const html = render({ loading: true, type: "submit" });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
  });

  it("keeps its accessible name while only the spinner is shown", () => {
    const html = render({ loading: true });
    expect(html).toContain("ส่งรายงาน");
    expect(html).toContain("kru-spin");
  });

  it("is really disabled when it is unavailable, busy or not", () => {
    expect(render({ disabled: true })).toMatch(/<button[^>]*\sdisabled/);
    const both = render({ disabled: true, loading: true });
    expect(both).toMatch(/<button[^>]*\sdisabled/);
    expect(both).not.toContain("aria-disabled");
  });

  it("has no busy attributes when idle", () => {
    const html = render({});
    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("aria-disabled");
  });

  it("ignores clicks, and so a submit it would start, while busy", () => {
    const onClick = vi.fn();
    const element = Button({ loading: true, onClick, type: "submit", children: "ส่ง" }) as React.ReactElement<{ onClick: (event: { preventDefault: () => void }) => void }>;
    const preventDefault = vi.fn();
    element.props.onClick({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("passes clicks through when idle", () => {
    const onClick = vi.fn();
    const element = Button({ onClick, children: "ส่ง" }) as React.ReactElement<{ onClick: (event: unknown) => void }>;
    element.props.onClick({});
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("styles the busy state like the disabled one and keeps hover effects off it", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.kru-btn:disabled,\s*\.kru-btn\[aria-disabled="true"\]\s*\{/);
    for (const variant of ["primary", "secondary", "soft", "ghost"]) {
      expect(css).toContain(`.kru-btn--${variant}:hover:not(:disabled):not([aria-disabled="true"])`);
    }
  });
});
