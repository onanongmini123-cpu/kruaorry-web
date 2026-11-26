import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const drawer = readFileSync(new URL("./ResourceEditorDrawer.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./adminResources.css", import.meta.url), "utf8");

describe("resource editor drawer", () => {
  it("is a modal dialog with a title and the save bar outside the scrolling body", () => {
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain('aria-modal="true"');
    expect(drawer).toContain("aria-labelledby={titleId}");
    expect(drawer.indexOf("kru-res-drawer__body")).toBeLessThan(drawer.indexOf("kru-res-drawer__footer"));
    expect(css).toMatch(/\.kru-res-drawer__body\s*\{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.kru-res-drawer\s*\{[^}]*height: 100dvh/);
    expect(css).toMatch(/\.kru-res-drawer-layer\s*\{[^}]*position: fixed/);
  });

  it("submits the form from the footer without nesting the button in it", () => {
    expect(drawer).toContain("form={formId}");
    expect(drawer).toContain('type="submit"');
  });

  it("closes on Escape, the scrim and the close button, asking first when there are unsaved edits", () => {
    expect(drawer).toContain('event.key === "Escape"');
    expect(drawer).toContain("onClick={requestClose}");
    expect(drawer).toContain("window.confirm(UNSAVED_CONFIRM_MESSAGE)");
    expect(drawer).toContain("if (isSaving) return;");
  });

  it("keeps keyboard focus inside, moves it in on open and gives it back on close", () => {
    expect(drawer).toContain('event.key !== "Tab"');
    expect(drawer).toContain("opener.focus()");
    expect(drawer).toContain('document.body.style.overflow = "hidden"');
    expect(drawer).toContain("document.body.style.overflow = previousOverflow");
  });

  it("does not animate for people who ask for reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });
});

describe("resource management page uses the drawer and the list tools", () => {
  it("opens the editor in the drawer instead of an inline form above the list", () => {
    expect(page).toContain("<ResourceEditorDrawer");
    expect(page).toContain('formId="resource-form"');
    expect(page).toContain("dirty={formDirty}");
    expect(page).toContain("error={formError}");
    expect(page).toContain('<form id="resource-form" onSubmit={handleSaveResource}');
    expect(page).not.toContain("ปิดฟอร์ม");
  });

  it("tracks unsaved edits from a baseline taken when the editor opens", () => {
    expect(page).toContain("setFormBaseline(JSON.stringify(EMPTY_FORM))");
    expect(page).toContain("setFormBaseline(JSON.stringify(nextForm))");
    expect(page).toContain("JSON.stringify(form) !== formBaseline");
  });

  it("offers search, status chips with counts and a needs-attention filter", () => {
    expect(page).toContain("STATUS_FILTER_ORDER.map");
    expect(page).toContain("filterResources(resources, { query: resourceQuery, status: resourceFilter })");
    expect(page).toContain('aria-pressed={resourceFilter === key}');
    expect(page).toContain("ล้างตัวกรอง");
  });

  it("splits the page into three tabs: all resources, homepage, tools", () => {
    expect(page).toContain('role="tablist" aria-label="มุมมองจัดการสื่อ"');
    expect(page).toContain('useState<"list" | "home" | "tools">("list")');
    for (const tab of ["list", "home", "tools"]) {
      expect(page).toContain(`contentTab === "${tab}"`);
      expect(page).toContain(`id="res-panel-${tab}" role="tabpanel"`);
    }
    expect(page).toContain("สื่อทั้งหมด ({resources.length})");
    expect(page).toContain("เลือกแท็บด้านล่าง: สื่อทั้งหมด · หน้าแรก (แบนเนอร์ วิดีโอ Hero) · เครื่องมือ");
  });

  it("the homepage tab folds banners, videos and the Hero list; tools holds cover compression; each panel appears once", () => {
    const home = page.slice(page.indexOf('{contentTab === "home" && ('), page.indexOf('{contentTab === "tools" && ('));
    expect(home.match(/<details className="kru-card kru-admin-fold"/g)).toHaveLength(3);
    expect(home).toContain("<summary>แบนเนอร์ประชาสัมพันธ์</summary>");
    expect(home).toContain("<summary>วิดีโอแนะนำ (สูงสุด 4 คลิป)</summary>");
    expect(home).toContain('<details className="kru-card kru-admin-fold" open>');
    expect(home).toContain("<summary>สื่อแนะนำใน Hero ({featuredIds.length}/5)</summary>");
    expect(home).toContain("<AdminPromoBannersPanel supabase={supabase} />");
    expect(home).toContain("<AdminHomepageVideosPanel supabase={supabase} />");
    expect(home).toContain("handleSaveFeatured");
    expect(home).toContain('<section className="kru-admin-featured-panel" aria-labelledby="featured-resources-title">');
    const toolsStart = page.indexOf('{contentTab === "tools" && (');
    const tools = page.slice(toolsStart, page.indexOf('{contentTab === "list" && (', toolsStart));
    expect(tools).toContain("<AdminCoverCompressPanel supabase={supabase} />");
    for (const panel of ["<AdminPromoBannersPanel ", "<AdminHomepageVideosPanel ", "<AdminCoverCompressPanel ", 'aria-labelledby="featured-resources-title"']) {
      expect(page.split(panel).length - 1, panel).toBe(1);
    }
  });

  it("confirms a save and keeps every existing action (status change, delete)", () => {
    expect(page).toContain("setSavedNotice(`บันทึก “${payload.title}” แล้ว`)");
    expect(page).toContain("handleStatusChange(item.id, e.target.value as ResourceStatus)");
    expect(page).toContain("handleDeleteResource(item.id, item.title)");
  });

  it("labels every control in the form so a screen reader can name it", () => {
    for (const id of ["resource-description", "resource-file", "resource-cover"]) {
      expect(page).toContain(`htmlFor="${id}"`);
      expect(page).toContain(`id="${id}"`);
    }
  });
});
