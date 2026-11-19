// YouTube link handling for the "how to play" videos. Only the 11-character
// video id is ever stored; the embed address is always rebuilt from it, so an
// admin can never save an arbitrary URL into the player.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

export function isYouTubeVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID.test(value);
}

/**
 * Accepts a normal watch link, a youtu.be short link, a Shorts link, an embed
 * link, or the bare 11-character id. Returns null for anything else (other
 * sites, playlists without a video, malformed ids).
 */
export function parseYouTubeVideoId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text) return null;
  if (VIDEO_ID.test(text)) return text;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") candidate = url.searchParams.get("v");
    else if (first === "shorts" || first === "embed" || first === "live" || first === "v") candidate = second ?? null;
  }
  return isYouTubeVideoId(candidate) ? candidate : null;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
