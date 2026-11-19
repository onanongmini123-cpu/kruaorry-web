import { YouTubeClickToPlay } from "@/components/YouTubeClickToPlay";
import { isYouTubeVideoId } from "@/lib/youtube";

/**
 * "How to play" video under the resource summary. Renders nothing for a
 * missing or malformed id, so a resource without a video looks exactly as it
 * did before.
 */
export function HowToPlayVideo({ videoId, resourceTitle }: { videoId: string | null; resourceTitle: string }) {
  if (!isYouTubeVideoId(videoId)) return null;
  return (
    <section className="kru-card kru-detail__section kru-detail__video" aria-labelledby="how-to-play-video-heading">
      <h2 id="how-to-play-video-heading">วิดีโอแนะนำวิธีเล่น</h2>
      <YouTubeClickToPlay videoId={videoId} title={`วิดีโอแนะนำวิธีเล่น ${resourceTitle}`} />
    </section>
  );
}
