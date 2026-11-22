import { describe, expect, it } from "vitest";
import { homepageVideosPayload } from "./AdminHomepageVideosPanel";

const a = "https://youtu.be/aaaaaaaaaaa";
const b = "https://www.youtube.com/shorts/bbbbbbbbbbb";

describe("homepage videos admin payload", () => {
  it("all blank = an empty list, which hides the homepage section", () => {
    expect(homepageVideosPayload([{ link: "", title: "" }, { link: "  ", title: "" }, { link: "", title: "" }])).toEqual({ ok: true, videos: [] });
  });

  it("skips blank rows, keeps order, normalizes links to ids and includes titles only when given", () => {
    expect(homepageVideosPayload([{ link: a, title: " วิธีเล่น  เกม " }, { link: "", title: "" }, { link: b, title: "" }])).toEqual({
      ok: true,
      videos: [{ videoId: "aaaaaaaaaaa", title: "วิธีเล่น เกม" }, { videoId: "bbbbbbbbbbb" }],
    });
  });

  it("blocks bad input with a Thai message naming the row", () => {
    expect(homepageVideosPayload([{ link: "https://vimeo.com/1", title: "" }, { link: "", title: "" }, { link: "", title: "" }])).toMatchObject({ ok: false, message: expect.stringContaining("วิดีโอที่ 1") });
    expect(homepageVideosPayload([{ link: "", title: "มีแต่ชื่อ" }, { link: "", title: "" }, { link: "", title: "" }])).toMatchObject({ ok: false, message: expect.stringContaining("ยังไม่ได้ใส่ลิงก์") });
    expect(homepageVideosPayload([{ link: a, title: "" }, { link: a, title: "" }, { link: "", title: "" }])).toMatchObject({ ok: false, message: "วิดีโอที่ 2: วิดีโอนี้ซ้ำกับช่องที่ 1" });
    // the duplicate is reported against the slot it repeats, even when a blank slot sits between them
    expect(homepageVideosPayload([{ link: a, title: "" }, { link: "", title: "" }, { link: a, title: "" }])).toMatchObject({ ok: false, message: "วิดีโอที่ 3: วิดีโอนี้ซ้ำกับช่องที่ 1" });
    expect(homepageVideosPayload([{ link: a, title: "" }, { link: b, title: "" }, { link: "https://www.youtube.com/watch?v=bbbbbbbbbbb", title: "" }])).toMatchObject({ ok: false, message: "วิดีโอที่ 3: วิดีโอนี้ซ้ำกับช่องที่ 2" });
    expect(homepageVideosPayload([{ link: a, title: "x".repeat(81) }, { link: "", title: "" }, { link: "", title: "" }])).toMatchObject({ ok: false });
  });
});
