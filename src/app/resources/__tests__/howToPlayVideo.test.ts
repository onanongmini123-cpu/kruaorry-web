import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HowToPlayVideo } from "../[key]/HowToPlayVideo";

const render = (videoId: string | null) => renderToStaticMarkup(React.createElement(HowToPlayVideo, { videoId, resourceTitle: "ตกปลาคำศัพท์" }));

describe("how-to-play video", () => {
  it("renders nothing when a resource has no video (existing pages stay as they were)", () => {
    expect(render(null)).toBe("");
    expect(render("")).toBe("");
    expect(render("not-an-id")).toBe("");
    expect(render("<script>alert(1)</script>")).toBe("");
  });

  it("shows the Thai heading and a click-to-play thumbnail, with no player loaded yet", () => {
    const html = render("dQw4w9WgXcQ");
    expect(html).toContain("วิดีโอแนะนำวิธีเล่น");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(html).toContain("<button");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube-nocookie.com");
  });
});
