import { describe, expect, it } from "vitest";
import { signupHref, toPublicResource } from "@/app/resources/catalog";
import { safeAuthNext } from "../authReturnPath";
import { resourceIdFromSearch } from "../resourceDeepLink";

const id = "123e4567-e89b-42d3-a456-426614174000";
const publicRow = {
  id,
  status: "published",
  title: "สื่อจริง",
  meta: "คณิตศาสตร์",
  description: "ตัวอย่างที่ใช้ได้จริง",
  category: "คณิตศาสตร์",
  delivery_mode: "file_download",
  cta_url: null,
  file_path: `${id}/sample.pdf`,
  cover_image_url: "https://cdn.school.example/cover.png",
  tags: ["ใบงาน"],
  is_free: true,
  file_name: "sample.pdf",
};

describe("public preview → signup → intended resource", () => {
  it("returns a free-file signup to the same signed-in download route", () => {
    const item = toPublicResource(publicRow);
    expect(item).not.toBeNull();
    const next = new URL(signupHref(item!), "https://kruaorry.example").searchParams.get("next");
    expect(safeAuthNext(next)).toBe(`/download/${id}`);
  });

  it("returns a non-file signup to the exact published item in the member app", () => {
    const item = toPublicResource({ ...publicRow, delivery_mode: "google_template", file_path: null, cta_url: "https://docs.google.com/document/d/valid-copy-id/copy" });
    expect(item).not.toBeNull();
    const next = safeAuthNext(new URL(signupHref(item!), "https://kruaorry.example").searchParams.get("next"));
    expect(resourceIdFromSearch(new URL(next, "https://kruaorry.example").search, [{ id }])).toBe(id);
    expect(resourceIdFromSearch(new URL(next, "https://kruaorry.example").search, [])).toBeNull();
  });
});
