import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source pins for the admin form: the demo section exists, keeps the full version's
// fields untouched, and saves through its own admin-only function.
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const drawer = readFileSync(new URL("./ResourceEditorDrawer.tsx", import.meta.url), "utf8");

describe("admin resource form: ทดลองเล่น/ดูตัวอย่าง", () => {
  it("has the section with the none / URL options and no file option yet", () => {
    expect(page).toContain("ทดลองเล่น/ดูตัวอย่าง");
    expect(page).toContain('aria-labelledby="res-sec-demo"');
    const options = readFileSync(new URL("../../lib/resourceDemoUrl.ts", import.meta.url), "utf8");
    expect(options).toContain('label: "ไม่มี"');
    expect(options).toContain('label: "URL เดโม"');
    expect(options).not.toContain('"file"');
  });

  it("stores the demo in its own field and function, never in cta_url / file_path", () => {
    expect(page).toContain('supabase.rpc("admin_set_resource_demo"');
    expect(page).toContain("p_demo_url: demoParam");
    const adminSave = page.slice(page.indexOf('supabase.rpc("admin_save_resource"'), page.indexOf("pendingUploads,", page.indexOf('supabase.rpc("admin_save_resource"')));
    expect(adminSave).not.toMatch(/demo/i);
  });

  it("reuses the dirty guard: the demo lives in the same form state the guard compares", () => {
    expect(page).toContain("demo_mode:");
    expect(page).toContain("demo_url:");
    expect(page).toContain("JSON.stringify(form) !== formBaseline");
    expect(drawer).toContain('export const UNSAVED_CONFIRM_MESSAGE = "มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการปิดโดยไม่บันทึกหรือไม่?"');
  });

  it("blocks saving an invalid demo and one equal to the full version before any upload starts", () => {
    const validate = page.indexOf("demoUrlProblem(demoInput)");
    const firstUpload = page.indexOf("runCoverUpload(selectedCoverFile)");
    expect(validate).toBeGreaterThan(0);
    expect(validate).toBeLessThan(firstUpload);
    expect(page).toContain("demoSameAsFullVersion(demoInput, form.cta_url)");
  });
});

describe("public detail page", () => {
  const detail = readFileSync(new URL("../resources/[key]/page.tsx", import.meta.url), "utf8");
  it("opens the demo only by the visitor's click, in a new tab, with no redirect call", () => {
    expect(detail).toContain("demo.href");
    expect(detail).toContain('rel="noopener noreferrer"');
    expect(detail).not.toMatch(/redirect\([^)]*demo/i);
    expect(detail).not.toMatch(/router\.(push|replace)/);
    expect(detail).not.toMatch(/window\.location/);
  });
});
