import { describe, expect, it } from "vitest";
import { isYouTubeVideoId, parseYouTubeVideoId, youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/youtube";

const ID = "dQw4w9WgXcQ";

describe("YouTube link parsing", () => {
  it("accepts watch, short, Shorts, embed and mobile links and a bare id", () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
      `http://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/shorts/${ID}?feature=share`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `www.youtube.com/watch?v=${ID}`,
      `  ${ID}  `,
    ]) {
      expect(parseYouTubeVideoId(link), link).toBe(ID);
    }
  });

  it("rejects other sites, look-alike hosts, bad ids and non-strings", () => {
    for (const bad of [
      "", "   ", "hello", `https://vimeo.com/${ID}`, `https://evil.example/watch?v=${ID}`,
      `https://youtube.com.evil.example/watch?v=${ID}`, `https://notyoutube.com/watch?v=${ID}`,
      "https://www.youtube.com/watch?v=short", "https://www.youtube.com/watch", "https://www.youtube.com/playlist?list=PL123",
      `https://www.youtube.com/watch?v=${ID}extra`, `javascript:alert(1)//youtu.be/${ID}`, `ftp://youtu.be/${ID}`,
      "https://youtu.be/", `https://www.youtube.com/watch?v=${ID.slice(0, 10)}!`,
    ]) {
      expect(parseYouTubeVideoId(bad), String(bad)).toBeNull();
    }
    for (const bad of [null, undefined, 42, {}, []]) expect(parseYouTubeVideoId(bad)).toBeNull();
  });

  it("validates ids and rebuilds the player address from the id only", () => {
    expect(isYouTubeVideoId(ID)).toBe(true);
    expect(isYouTubeVideoId("dQw4w9WgXc")).toBe(false);
    expect(isYouTubeVideoId(null)).toBe(false);
    expect(youtubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`);
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});
