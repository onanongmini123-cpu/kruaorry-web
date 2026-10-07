import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Lock } from "lucide-react";
import { Badge, ResourceCard, Tag } from "@/components/ui";
import { PublicTopBar } from "@/components/PublicTopBar";
import { TrackedAnchor } from "@/components/analytics/TrackedAnchor";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { ResourceFeedback } from "@/components/ResourceFeedback";
import { accessDescription, accessLabel, accessTier } from "@/lib/resourceAccess";
import { formatResourceGrades } from "@/lib/resourceGrades";
import { DELIVERY_TYPE_LABEL, parseResourceMeta } from "@/lib/resourceMeta";
import { breadcrumbJsonLd, jsonLdScript, resourceJsonLd, resourceSeoDescription, resourceSeoTitle } from "@/lib/resourceSeo";
import { DEFAULT_SHARE_IMAGE } from "@/lib/site";
import { loadPublicResourceViewer, loadRelatedResources, resolvePublicResource } from "../data";
import { publicResourceAction, resourceHref } from "../catalog";
import { resourceAccessCopy } from "../detailCopy";
import { PublicResourceCover } from "../PublicResourceCover";
import "./detail.css";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const lookup = await resolvePublicResource(key);
  if (lookup.status !== "found") return { title: "ไม่พบสื่อ", robots: { index: false, follow: false } };

  const { resource, canonicalPath } = lookup;
  const title = resourceSeoTitle(resource);
  const description = resourceSeoDescription(resource);
  const images = resource.coverImageUrl ? [{ url: resource.coverImageUrl, alt: `ภาพปก ${resource.title}` }] : [DEFAULT_SHARE_IMAGE];
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    // A resource that is not open yet is not worth a search result.
    robots: resource.accessMode === "locked" ? { index: false, follow: true } : undefined,
    openGraph: { type: "website", locale: "th_TH", title, description, url: canonicalPath, images },
    twitter: { card: resource.coverImageUrl ? "summary_large_image" : "summary", title, description, images: images.map((image) => image.url) },
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="kru-card kru-detail__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return <ul className="kru-detail__list">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export default async function ResourceDetailPage({ params }: Props) {
  const { key } = await params;
  const [lookup, viewer] = await Promise.all([resolvePublicResource(key), loadPublicResourceViewer()]);

  if (lookup.status === "not_found") notFound();
  if (lookup.status === "unavailable") {
    return (
      <div className="kru-detail__page">
        <main className="kru-detail__main">
          <div role="status" className="kru-card kru-detail__section" style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "var(--fs-24)" }}>ยังโหลดสื่อนี้ไม่ได้</h1>
            <p style={{ color: "var(--text-muted)", marginTop: "var(--sp-3)" }}>ไม่สามารถโหลดข้อมูลได้ในขณะนี้ กรุณาลองอีกครั้ง</p>
            <Link href={`/resources/${key}`} className="kru-btn kru-btn--primary" style={{ marginTop: "var(--sp-5)" }}>ลองใหม่</Link>
          </div>
        </main>
      </div>
    );
  }
  // The same address in another form (UUID where a slug exists, or odd casing)
  // is moved permanently to the canonical URL so search engines keep one page.
  if (lookup.redirectTo) permanentRedirect(lookup.redirectTo);

  const { resource: item, canonicalPath } = lookup;
  const action = publicResourceAction(item, viewer);
  const copy = resourceAccessCopy(item, viewer, action);
  const tier = accessTier(item.accessMode);
  const gradeText = formatResourceGrades(item.gradeLevels);
  const parsedMeta = parseResourceMeta(item.meta);
  const detail = item.detail;
  const related = await loadRelatedResources(item, 6);
  const audience = detail?.audience
    ?? (item.category || gradeText
      ? `ครูที่สอน${item.category ? `วิชา${item.category.replace(/^วิชา/, "")}` : ""}${gradeText ? ` ระดับชั้น ${gradeText}` : ""}`
      : null);
  const contents = detail?.contents.length ? detail.contents : parsedMeta.metrics;
  // What pressing the main button provably means for this viewer.
  const ctaEvents = action.canUse
    ? [
        { name: "resource_start" as const, properties: { resource_id: item.id, slug: item.slug ?? "", access_tier: tier, delivery_mode: item.deliveryMode, source: "detail" } },
        ...(item.deliveryMode === "web_app" ? [{ name: "outbound_game_open" as const, properties: { resource_id: item.id, source: "detail" } }] : []),
      ]
    : item.accessMode === "plans"
      ? [{ name: "upgrade_click" as const, properties: { resource_id: item.id, plan_id: item.requiredPlanIds.includes("founder") ? "founder" : "teacher", source: "resource_detail" } }]
      : item.accessMode === "authenticated"
        ? [{ name: "signup_start" as const, properties: { resource_id: item.id, source: "resource_detail" } }]
        : [];
  const players = detail?.players ?? parsedMeta.playModes;

  return (
    <div className="kru-detail__page">
      <TrackOnMount
        event="resource_view"
        properties={{ resource_id: item.id, slug: item.slug ?? "", access_tier: tier, delivery_mode: item.deliveryMode, authenticated: viewer.authenticated }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(resourceJsonLd(item, canonicalPath)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd(item.title, canonicalPath)) }}
      />
      <PublicTopBar actionHref="/resources" actionLabel="คลังสื่อ" />

      <main className="kru-detail__main">
        <Link href="/resources" className="kru-detail__back"><ArrowLeft size={17} aria-hidden="true" />กลับไปคลังสื่อ</Link>

        <div className="kru-detail__top">
          <div className="kru-card kru-detail__cover">
            <PublicResourceCover title={item.title} url={item.coverImageUrl} deliveryMode={item.deliveryMode} eager style={{ aspectRatio: "4 / 3" }} />
            <p>{copy.coverCaption}</p>
          </div>

          <div className="kru-detail__summary">
            <div className="kru-detail__badges">
              {item.isNew && <Badge tone="brand">ใหม่</Badge>}
              <Badge tone={tier === "pro" ? "member" : tier === "unavailable" ? "neutral" : "success"} icon={tier === "free" || tier === "member" ? undefined : Lock}>
                {accessLabel(item.accessMode)}
              </Badge>
            </div>
            <h1>{item.title}</h1>
            <p className="kru-detail__tier-note">{accessDescription(item.accessMode)}</p>

            <dl className="kru-detail__facts">
              {gradeText && <div><dt>ระดับชั้น</dt><dd>{gradeText}</dd></div>}
              {item.category && <div><dt>วิชา</dt><dd>{item.category}</dd></div>}
              <div><dt>ประเภท</dt><dd>{DELIVERY_TYPE_LABEL[item.deliveryMode]}</dd></div>
              {detail?.estimatedMinutes && <div><dt>เวลาโดยประมาณ</dt><dd>{detail.estimatedMinutes} นาที</dd></div>}
              {players && <div><dt>รูปแบบการเล่น</dt><dd>{players}</dd></div>}
            </dl>

            <div className="kru-card kru-detail__cta">
              <div className="kru-detail__cta-heading">{action.locked ? <Lock size={20} aria-hidden="true" /> : <BookOpen size={20} aria-hidden="true" />}{copy.heading}</div>
              <p>{copy.description}</p>
              {item.accessMode === "locked" && !action.canUse ? (
                <button type="button" disabled className="kru-btn kru-btn--primary kru-btn--block">{action.label}</button>
              ) : (
                <TrackedAnchor
                  events={ctaEvents}
                  className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block"
                  href={action.href}
                  target={action.opensNewTab ? "_blank" : undefined}
                  rel={action.opensNewTab ? "noopener noreferrer" : undefined}
                  referrerPolicy={action.opensNewTab ? "no-referrer" : undefined}
                >
                  {action.label}<ArrowRight size={18} aria-hidden="true" />
                </TrackedAnchor>
              )}
            </div>
          </div>
        </div>

        <div className="kru-detail__sections">
          {audience && (
            <Section title="เหมาะสำหรับ"><p>{audience}</p></Section>
          )}
          {detail?.objectives.length ? <Section title="เป้าหมายการเรียนรู้"><BulletList items={detail.objectives} /></Section> : null}
          {contents.length > 0 && (
            <Section title={item.deliveryMode === "web_app" ? "ภายในเกม/สื่อมีอะไร" : "ภายในสื่อมีอะไร"}><BulletList items={contents} /></Section>
          )}
          {detail?.classroomUse.length ? <Section title="วิธีใช้ในห้องเรียน"><BulletList items={detail.classroomUse} /></Section> : null}
          {detail?.howToPlay.length ? <Section title="วิธีเล่น"><ol className="kru-detail__list kru-detail__list--ordered">{detail.howToPlay.map((step) => <li key={step}>{step}</li>)}</ol></Section> : null}
          {detail?.previews.length ? (
            <Section title="รูปตัวอย่าง">
              <div className="kru-detail__previews">
                {detail.previews.map((preview) => (
                  <figure key={preview.url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview.url} alt={preview.caption ?? `ตัวอย่างจาก ${item.title}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                    {preview.caption && <figcaption>{preview.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </Section>
          ) : null}
          {item.description && (
            <Section title="รายละเอียด"><p className="kru-detail__description">{item.description}</p></Section>
          )}
          {item.tags.length > 0 && (
            <div className="kru-detail__tags" aria-label="หัวข้อที่เกี่ยวข้อง">{item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
          )}
          {detail?.faq.length ? (
            <Section title="คำถามที่พบบ่อย">
              <div className="kru-detail__faq">
                {detail.faq.map((entry) => (
                  <details key={entry.question}>
                    <summary>{entry.question}</summary>
                    <p>{entry.answer}</p>
                  </details>
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        <ResourceFeedback
          resourceId={item.id}
          authenticated={viewer.authenticated}
          canInteract={action.canUse}
          initialAverage={item.reviewAverage}
          initialCount={item.reviewCount}
        />

        {related.length > 0 && (
          <section className="kru-detail__related" aria-labelledby="related-heading">
            <h2 id="related-heading">สื่อที่เกี่ยวข้อง</h2>
            <div className="kru-detail__related-grid">
              {related.map((other) => (
                <ResourceCard
                  key={other.id}
                  title={other.title}
                  description={other.description}
                  meta={other.meta}
                  category={other.category}
                  deliveryMode={other.deliveryMode}
                  gradeLevels={other.gradeLevels}
                  requiredPlanNames={other.requiredPlanNames}
                  accessTier={accessTier(other.accessMode)}
                  coverImageUrl={other.coverImageUrl}
                  isNew={other.isNew}
                  locked={publicResourceAction(other, viewer).locked}
                  href={resourceHref(other)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
