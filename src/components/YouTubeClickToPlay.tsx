"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { isYouTubeVideoId, youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/youtube";

/**
 * A YouTube video that loads nothing from YouTube's player until pressed: the
 * first view is a lazy thumbnail, and the player is the privacy-enhanced
 * youtube-nocookie embed. Renders nothing for a missing or malformed id.
 */
export function YouTubeClickToPlay({ videoId, title }: { videoId: string | null; title: string }) {
  const [playing, setPlaying] = useState(false);
  if (!isYouTubeVideoId(videoId)) return null;

  return (
    <div className="kru-yt">
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(videoId)}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" className="kru-yt__play" onClick={() => setPlaying(true)} aria-label={`เล่นวิดีโอ ${title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youtubeThumbnailUrl(videoId)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          <span className="kru-yt__icon" aria-hidden="true"><Play size={28} fill="currentColor" /></span>
        </button>
      )}
      <style jsx>{`
        .kru-yt { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: var(--r-md); background: #000; }
        .kru-yt iframe, .kru-yt__play, .kru-yt__play img { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
        .kru-yt__play { display: grid; place-items: center; padding: 0; background: #000; cursor: pointer; }
        .kru-yt__play img { object-fit: cover; }
        .kru-yt__icon { position: relative; width: 68px; height: 68px; display: grid; place-items: center; border-radius: 50%; background: rgba(23, 33, 61, 0.82); color: #fff; }
        .kru-yt__play:focus-visible { outline: 3px solid var(--purple-700, #7256a8); outline-offset: -3px; }
      `}</style>
    </div>
  );
}
