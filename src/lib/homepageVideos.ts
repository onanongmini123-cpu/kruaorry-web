import { isYouTubeVideoId } from "@/lib/youtube";

export const HOMEPAGE_VIDEO_LIMIT = 4;

export interface HomepageVideo {
  videoId: string;
  title: string | null;
}

/**
 * Validates the homepage video rows (migration 058). Anything malformed is
 * dropped, the list is ordered by position and capped at four, and an empty
 * result means the homepage section is hidden.
 */
export function parseHomepageVideos(rows: unknown): HomepageVideo[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row): { position: number; video: HomepageVideo } | null => {
      if (!row || typeof row !== "object") return null;
      const { position, youtube_video_id: videoId, title } = row as Record<string, unknown>;
      if (typeof position !== "number" || !Number.isInteger(position) || position < 1) return null;
      if (!isYouTubeVideoId(videoId)) return null;
      const cleanTitle = typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      return { position, video: { videoId, title: cleanTitle || null } };
    })
    .filter((entry): entry is { position: number; video: HomepageVideo } => entry !== null)
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.video)
    .slice(0, HOMEPAGE_VIDEO_LIMIT);
}
