import Link from "next/link";
import { ArrowRight, Eye } from "lucide-react";

/**
 * Watermarked preview pictures for a Pro resource the viewer cannot open yet.
 * It shows pictures only and one link to the membership page: it never receives,
 * renders or links to the real file or destination of the resource.
 */
export function TrialPreview({ images, resourceTitle, upgradeHref }: { images: readonly string[]; resourceTitle: string; upgradeHref: string }) {
  if (images.length === 0) return null;
  return (
    <section className="kru-card kru-detail__section kru-detail__trial" aria-labelledby="trial-preview-heading">
      <h2 id="trial-preview-heading"><Eye size={20} aria-hidden="true" /> ทดลองดูตัวอย่าง</h2>
      <p>ภาพตัวอย่างมีลายน้ำ “KruAorry.com – ตัวอย่าง” สื่อฉบับเต็มใช้ได้เฉพาะสมาชิก Teacher Pro</p>
      <div className="kru-detail__previews">
        {images.map((url, index) => (
          <figure key={url}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`ตัวอย่างที่ ${index + 1} ของ ${resourceTitle} (มีลายน้ำ)`} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </figure>
        ))}
      </div>
      <Link href={upgradeHref} className="kru-btn kru-btn--primary kru-btn--lg">
        อยากใช้ฉบับเต็ม? สมัคร Teacher Pro <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}
