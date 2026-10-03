import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Circle } from "lucide-react";
import { describe, expect, it } from "vitest";
import { SideNav } from "./SideNav";

describe("SideNav action badges", () => {
  it("announces the full actionable count while capping only the visual value", () => {
    const markup = renderToStaticMarkup(React.createElement(SideNav, {
      groups: [{ items: [{ key: "queue", label: "คิวงาน", icon: Circle, badge: 120 }] }],
      value: "queue",
      onChange: () => undefined,
    }));

    expect(markup).toContain("คิวงาน มี 120 รายการที่ต้องดำเนินการ");
    expect(markup).toContain("99+");
    expect(markup).toContain('class="kru-sidenav__badge"');
  });

  it("does not render or announce a badge when there is no work", () => {
    const markup = renderToStaticMarkup(React.createElement(SideNav, {
      groups: [{ items: [{ key: "queue", label: "คิวงาน", icon: Circle, badge: 0 }] }],
      value: "other",
      onChange: () => undefined,
    }));

    expect(markup).not.toContain("kru-sidenav__badge");
    expect(markup).not.toContain("รายการที่ต้องดำเนินการ");
  });

  it("shows an unknown state instead of falsely reporting zero", () => {
    const markup = renderToStaticMarkup(React.createElement(SideNav, {
      groups: [{ items: [{ key: "queue", label: "คิวงาน", icon: Circle, badge: null }] }],
      value: "other",
      onChange: () => undefined,
    }));

    expect(markup).toContain("ยังตรวจจำนวนรายการที่ต้องดำเนินการไม่ได้");
    expect(markup).toContain(">—</span>");
  });
});
