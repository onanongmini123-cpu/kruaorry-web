import { YouTubeClickToPlay } from "@/components/YouTubeClickToPlay";
import type { HomepageVideo } from "@/lib/homepageVideos";

/** "วิดีโอแนะนำ" on the homepage. Renders nothing when staff have not chosen any. */
export function HomepageVideosSection({ videos }: { videos: HomepageVideo[] }) {
  if (videos.length === 0) return null;
  return (
    <section className="kru-home-videos" aria-labelledby="home-videos-heading">
      <h2 id="home-videos-heading">วิดีโอแนะนำ</h2>
      <div className="kru-home-videos__grid">
        {videos.map((video, index) => (
          <figure key={video.videoId}>
            <YouTubeClickToPlay videoId={video.videoId} title={video.title ?? `วิดีโอแนะนำ ${index + 1}`} />
            {video.title && <figcaption>{video.title}</figcaption>}
          </figure>
        ))}
      </div>
      <style>{`
        .kru-home-videos { max-width: var(--container-max); margin: var(--sp-9, 48px) auto 0; padding: 0 var(--sp-5); }
        .kru-home-videos h2 { margin: 0 0 var(--sp-4); }
        .kru-home-videos__grid { display: grid; gap: var(--sp-5); grid-template-columns: minmax(0, 1fr); }
        .kru-home-videos figure { margin: 0; display: grid; gap: var(--sp-2); min-width: 0; }
        .kru-home-videos figcaption { color: var(--text-body); font-size: var(--fs-14); }
        @media (min-width: 720px) { .kru-home-videos__grid { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); } }
      `}</style>
    </section>
  );
}
