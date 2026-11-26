import { YouTubeClickToPlay } from "@/components/YouTubeClickToPlay";
import type { HomepageVideo } from "@/lib/homepageVideos";

/** "วิดีโอแนะนำ" on the homepage. Renders nothing when staff have not chosen any. */
export function HomepageVideosSection({ videos }: { videos: HomepageVideo[] }) {
  if (videos.length === 0) return null;
  return (
    <section className="kru-home-videos" aria-labelledby="home-videos-heading">
      <h2 id="home-videos-heading">วิดีโอแนะนำ</h2>
      <div className={`kru-home-videos__grid${videos.length === 1 ? " kru-home-videos__grid--single" : ""}`}>
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
        /* Phone: one swipeable row. Desktop: a 2x2 grid. */
        .kru-home-videos__grid { display: grid; grid-auto-flow: column; grid-auto-columns: min(84%, 340px); gap: var(--sp-4); overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: var(--sp-3); -webkit-overflow-scrolling: touch; }
        .kru-home-videos__grid--single { grid-auto-columns: 100%; }
        .kru-home-videos figure { margin: 0; display: grid; gap: var(--sp-2); min-width: 0; scroll-snap-align: start; align-content: start; }
        .kru-home-videos figcaption { color: var(--text-body); font-size: var(--fs-14); }
        @media (min-width: 720px) {
          .kru-home-videos__grid { grid-auto-flow: row; grid-auto-columns: unset; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-5); overflow: visible; scroll-snap-type: none; padding-bottom: 0; }
          .kru-home-videos__grid--single { grid-template-columns: minmax(0, 720px); justify-content: center; }
        }
      `}</style>
    </section>
  );
}
