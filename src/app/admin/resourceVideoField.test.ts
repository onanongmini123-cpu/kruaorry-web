import { describe, expect, it } from "vitest";
import { isVideoUnavailable, videoChangeForSave, videoFieldState, videoLinkForId } from "./resourceVideoField";

const ID = "dQw4w9WgXcQ";
const OTHER = "9bZkp7q19f0";

describe("admin YouTube field", () => {
  it("does nothing for a resource that never had a video and was left blank (existing resources are untouched)", () => {
    expect(videoFieldState("", "")).toEqual({ kind: "empty", hasSaved: false });
    expect(videoChangeForSave("", "")).toEqual({ changed: false });
    expect(videoChangeForSave("   ", "")).toEqual({ changed: false });
  });

  it("saves a new video from any accepted link form", () => {
    for (const link of [`https://youtu.be/${ID}`, `https://www.youtube.com/watch?v=${ID}`, `https://www.youtube.com/shorts/${ID}`]) {
      expect(videoFieldState(link, "")).toEqual({ kind: "new", videoId: ID });
      expect(videoChangeForSave(link, "")).toEqual({ changed: true, videoId: ID });
    }
  });

  it("does not call the RPC when the saved video is unchanged, and replaces it when different", () => {
    expect(videoChangeForSave(videoLinkForId(ID), ID)).toEqual({ changed: false });
    expect(videoChangeForSave(`https://youtu.be/${ID}?si=x`, ID)).toEqual({ changed: false });
    expect(videoFieldState(`https://youtu.be/${OTHER}`, ID)).toEqual({ kind: "changed", videoId: OTHER });
    expect(videoChangeForSave(`https://youtu.be/${OTHER}`, ID)).toEqual({ changed: true, videoId: OTHER });
  });

  it("clears a saved video only when the field is emptied", () => {
    expect(videoFieldState("", ID)).toEqual({ kind: "empty", hasSaved: true });
    expect(videoChangeForSave("", ID)).toEqual({ changed: true, videoId: null });
  });

  it("flags an invalid link and never sends it", () => {
    for (const bad of ["https://vimeo.com/123456", "hello", "https://www.youtube.com/watch?v=short"]) {
      const state = videoFieldState(bad, ID);
      expect(state.kind).toBe("invalid");
      expect(videoChangeForSave(bad, ID)).toEqual({ changed: false });
    }
  });

  it("builds the link shown in the form for a saved id", () => {
    expect(videoLinkForId(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(videoLinkForId(null)).toBe("");
    expect(videoLinkForId(undefined)).toBe("");
  });

  it("treats a missing column or no read permission as 'not available yet', not as a failure", () => {
    expect(isVideoUnavailable({ code: "42703", message: "column resources.youtube_video_id does not exist" })).toBe(true);
    expect(isVideoUnavailable({ code: "PGRST204", message: "Could not find the 'youtube_video_id' column of 'resources' in the schema cache" })).toBe(true);
    expect(isVideoUnavailable({ code: "42501", message: "permission denied for table resources" })).toBe(true);
    expect(isVideoUnavailable({ code: "57P01", message: "terminating connection" })).toBe(false);
    expect(isVideoUnavailable(null)).toBe(false);
  });
});
