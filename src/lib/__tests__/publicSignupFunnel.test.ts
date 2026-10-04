import { describe, expect, it } from "vitest";
import { signupHref, toPublicResource } from "@/app/resources/catalog";
import { FREE_SIGNUP_HREF } from "../authReturnPath";

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
  access_mode: "authenticated",
  required_plan_ids: [],
  required_plan_names: [],
  is_free: true,
  is_new: false,
  featured_rank: null,
  review_average: null,
  review_count: 0,
  file_name: "sample.pdf",
};

describe("public preview → canonical free signup", () => {
  it("returns a free-file signup to the member-app root before any download action", () => {
    const item = toPublicResource(publicRow);
    expect(item).not.toBeNull();
    expect(signupHref()).toBe(FREE_SIGNUP_HREF);
  });

  it("does not carry a non-file resource destination through account creation", () => {
    const item = toPublicResource({ ...publicRow, delivery_mode: "google_template", file_path: null, cta_url: "https://docs.google.com/document/d/valid-copy-id/copy" });
    expect(item).not.toBeNull();
    expect(signupHref()).toBe("/login?mode=signup&next=%2Fapp");
    expect(signupHref()).not.toContain(id);
  });
});
