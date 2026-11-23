import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HOMEPAGE_VIDEO_LIMIT, parseHomepageVideos } from "@/lib/homepageVideos";
import { HomepageVideosSection } from "@/app/landing/HomepageVideosSection";

describe("homepage videos", () => {
  it("orders by position, trims titles, drops malformed rows and caps at four", () => {
    const rows = [
      { position: 3, youtube_video_id: "ccccccccccc", title: null },
      { position: 1, youtube_video_id: "aaaaaaaaaaa", title: "  วิธีเล่น \n เกมแรก  " },
      { position: 2, youtube_video_id: "not valid!!", title: "bad id" },
      { position: 0, youtube_video_id: "zzzzzzzzzzz", title: "bad position" },
      null,
      "x",
      { position: 4, youtube_video_id: "ddddddddddd", title: "fourth" },
      { position: 5, youtube_video_id: "eeeeeeeeeee", title: "fifth" },
      { position: 6, youtube_video_id: "fffffffffff", title: "sixth" },
    ];
    expect(parseHomepageVideos(rows)).toEqual([
      { videoId: "aaaaaaaaaaa", title: "วิธีเล่น เกมแรก" },
      { videoId: "ccccccccccc", title: null },
      { videoId: "ddddddddddd", title: "fourth" },
      { videoId: "eeeeeeeeeee", title: "fifth" },
    ]);
    expect(HOMEPAGE_VIDEO_LIMIT).toBe(4);
  });

  it("returns nothing for non-arrays (a failed or missing read hides the section)", () => {
    for (const bad of [null, undefined, {}, "rows", 3]) expect(parseHomepageVideos(bad)).toEqual([]);
  });

  it("renders no section at all when there are no videos", () => {
    expect(renderToStaticMarkup(React.createElement(HomepageVideosSection, { videos: [] }))).toBe("");
  });

  it("renders the Thai heading, one lazy thumbnail per video and no player until pressed", () => {
    const html = renderToStaticMarkup(React.createElement(HomepageVideosSection, {
      videos: [{ videoId: "aaaaaaaaaaa", title: "วิธีเล่น" }, { videoId: "bbbbbbbbbbb", title: null }],
    }));
    expect(html).toContain("วิดีโอแนะนำ");
    expect(html.match(/loading="lazy"/g)).toHaveLength(2);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube-nocookie.com");
  });
});
