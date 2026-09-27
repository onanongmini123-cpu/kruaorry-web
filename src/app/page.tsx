"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileSpreadsheet,
  FolderOpen,
  Gift,
  Lock,
  MessageCircle,
  Search,
  Sparkles,
  Timer,
} from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, ExpandableResourceDescription, PillarTile } from "@/components/ui";
import { fetchFounderCapacity, fetchPlans, fetchPublishedResources, type Plan, type Resource } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { filterDiscoveredResources, resourceDiscoveryHref } from "@/lib/resourceDiscovery";
import { publicCoverUrl } from "@/lib/resourceVisibility";
import { LINE_OA_URL } from "@/lib/config";
import type { FounderCapacity } from "@/lib/founderCapacity";
import { PublicResourceCover } from "@/app/resources/PublicResourceCover";
import { FeaturedResourceCarousel, featuredAccessLabel } from "@/app/landing/FeaturedResourceCarousel";
import { PlanBenefits, billingIntervalLabel } from "@/app/landing/PlanBenefits";

const PILLARS = [
  { icon: FolderOpen, tone: "purple" as const, title: "คลังสื่อพร้อมสอน", desc: "ดาวน์โหลดแล้วใช้สอนได้เลย ไม่ต้องทำเอง", href: "/resources" },
  { icon: FileSpreadsheet, tone: "pink" as const, title: "เทมเพลต Google พร้อมใช้", desc: "ทำสำเนา Google Sheets, Docs, Slides และฟอร์มไปใช้ได้ทันที", href: resourceDiscoveryHref("/resources", { query: "Google" }) },
  { icon: Timer, tone: "blue" as const, title: "เครื่องมือในห้องเรียน", desc: "จับเวลา สุ่มชื่อ จับกลุ่ม เปิดใช้ได้ทันที", href: resourceDiscoveryHref("/resources", { query: "เครื่องมือ" }) },
];

type LandingResource = Resource & { isFree: boolean };

function toLandingResource(resource: Resource): LandingResource {
  const value = (resource as Resource & { gradeLevels?: unknown }).gradeLevels;
  return {
    ...resource,
    coverImageUrl: publicCoverUrl(resource.coverImageUrl),
    isFree: resource.free,
    gradeLevels: Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
  };
}

const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function LandingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [founderCapacity, setFounderCapacity] = useState<FounderCapacity | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [samplesLoaded, setSamplesLoaded] = useState(!isSupabaseConfigured);
  const [plansLoaded, setPlansLoaded] = useState(!isSupabaseConfigured);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [discoveryInput, setDiscoveryInput] = useState("");
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const discoverableResources = useMemo(() => resources.map(toLandingResource), [resources]);
  const freeSamples = useMemo(
    () => discoverableResources.filter((resource) => resource.accessMode === "public").slice(0, 3),
    [discoverableResources],
  );
  const discoveryMatches = useMemo(
    () => filterDiscoveredResources(discoverableResources, { query: discoveryQuery }).slice(0, 4),
    [discoveryQuery, discoverableResources],
  );
  const discoveryResultsHref = resourceDiscoveryHref("/resources", { query: discoveryQuery });

  const handleDiscoverySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDiscoveryQuery(discoveryInput.trim().slice(0, 100));
    setHasSearched(true);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const supabase = createClient();
    Promise.all([fetchPlans(supabase), fetchFounderCapacity(supabase)])
      .then(([rows, capacity]) => {
        if (!active) return;
        setPlans(rows);
        setFounderCapacity(capacity);
        setPlansLoaded(true);
      })
      .catch(() => {
        if (active) setPlansLoaded(true);
      });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const supabase = createClient();
    const refreshFounderCapacity = () => {
      void fetchFounderCapacity(supabase).then((capacity) => {
        if (active) setFounderCapacity(capacity);
      });
    };
    const timer = window.setInterval(refreshFounderCapacity, 60_000);
    window.addEventListener("focus", refreshFounderCapacity);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshFounderCapacity);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    fetchPublishedResources(createClient())
      .then((rows) => {
        if (active) setResources(rows);
      })
      .catch(() => {
        // Keep the public page usable when the catalog service is unavailable.
      })
      .finally(() => {
        if (active) setSamplesLoaded(true);
      });
    return () => { active = false; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "saturate(180%) blur(14px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--container-max)",
            margin: "0 auto",
            padding: "var(--sp-4) var(--sp-5)",
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-4)",
          }}
        >
          <Mascot size={32} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-18)", color: "var(--text-strong)" }}>
            KruAorry
          </span>
          <div style={{ flex: 1 }} />
          <Link href="/login" className="kru-btn kru-btn--ghost kru-btn--sm">เข้าสู่ระบบ</Link>
          <Link href="/login?mode=signup" className="kru-btn kru-btn--primary kru-btn--sm">สมัครฟรี</Link>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <section className="kru-discovery-hero">
          <div className="kru-discovery-hero__grid">
            <div className="kru-discovery-hero__content">
              <div className="kru-discovery-hero__eyebrow">
                <Mascot size={40} />
                <span>ผู้ช่วยของคุณครู พร้อมช่วยเลือกของที่ใช้ได้จริง</span>
              </div>
              <h1>วันนี้มีอะไรให้ครูอรรี่ช่วยคะ?</h1>
              <p className="kru-discovery-hero__lead">
                เลือกสิ่งที่คุณครูกำลังมองหา แล้วครูอรรี่จะพาไปยังสื่อและเครื่องมือที่พร้อมใช้ค่ะ
              </p>

              <form className="kru-discovery-search" role="search" onSubmit={handleDiscoverySubmit}>
                <label className="kru-visually-hidden" htmlFor="landing-discovery-search">ค้นหาสื่อและเครื่องมือ</label>
                <div className="kru-discovery-search__field">
                  <Search size={20} aria-hidden="true" />
                  <input
                    id="landing-discovery-search"
                    type="search"
                    value={discoveryInput}
                    onChange={(event) => setDiscoveryInput(event.target.value)}
                    placeholder="พิมพ์วิชา ระดับชั้น หรือเรื่องที่ต้องการ"
                    maxLength={100}
                    autoComplete="off"
                  />
                </div>
                <Button size="lg" type="submit">ให้ครูอรรี่ช่วยหา</Button>
              </form>

              <div className="kru-discovery-hero__secondary">
                <span>สื่อพร้อมสอนภาษาไทย เทมเพลต Google พร้อมใช้ และเครื่องมือในห้องเรียน</span>
                <Link href="/login?mode=signup">สมัครสมาชิกฟรี <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </div>

            {!hasSearched && (
              <FeaturedResourceCarousel
                resources={discoverableResources}
                loading={!samplesLoaded}
              />
            )}
          </div>
        </section>

        {hasSearched && (
          <section aria-live="polite" className="kru-discovery-results">
            <div className="kru-discovery-results__heading">
              <div>
                <p className="kru-discovery-results__eyebrow">ผลลัพธ์จากคลังสื่อที่เผยแพร่จริง</p>
                <h2>ครูอรรี่เลือกมาให้แล้วค่ะ</h2>
                {discoveryQuery && <p>คำค้น “{discoveryQuery}”</p>}
              </div>
              <Link href={discoveryResultsHref}>ดูสื่อทั้งหมด <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>

            {!samplesLoaded ? (
              <p role="status" className="kru-discovery-results__status">กำลังค้นหาสื่อที่เหมาะให้ค่ะ...</p>
            ) : discoveryMatches.length === 0 ? (
              <div role="status" className="kru-card kru-discovery-results__status">
                <strong>ยังไม่พบสื่อตรงกับคำค้นนี้</strong>
                <span>ลองใช้ชื่อวิชา ระดับชั้น หรือคำที่สั้นลง แล้วค้นหาอีกครั้งได้เลยค่ะ</span>
                <Link href="/resources">เปิดดูสื่อทั้งหมด</Link>
              </div>
            ) : (
              <div className="kru-discovery-results__grid">
                {discoveryMatches.map((resource) => {
                  const accessLabel = featuredAccessLabel(resource);
                  return (
                    <article key={resource.id} className="kru-card kru-discovery-result-card">
                      <Link href={`/resources/${resource.id}`} className="kru-discovery-result-card__cover" aria-label={`ดูรายละเอียด ${resource.title}`}>
                        <PublicResourceCover
                          title={resource.title}
                          url={resource.coverImageUrl}
                          deliveryMode={resource.affordance}
                          fallback="neutral"
                          style={{ aspectRatio: "1 / 1" }}
                        />
                        {resource.isNew && <span className="kru-resource-new-badge">ใหม่</span>}
                      </Link>
                      <div className="kru-discovery-result-card__body">
                        <span className={resource.accessMode === "public" ? "kru-discovery-result-card__badge kru-discovery-result-card__badge--free" : "kru-discovery-result-card__badge"}>
                          {resource.accessMode !== "public" && <Lock size={14} aria-hidden="true" />}
                          {accessLabel}
                        </span>
                        <h3><Link href={`/resources/${resource.id}`}>{resource.title}</Link></h3>
                        <ExpandableResourceDescription
                          title={resource.title}
                          description={resource.description || resource.meta}
                          fallback="ดูรายละเอียดและสิทธิ์การใช้งานของสื่อนี้"
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "var(--sp-12) var(--sp-5)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
            {PILLARS.map((p) => (
              <PillarTile key={p.title} icon={p.icon} tone={p.tone} title={p.title} description={p.desc} onClick={() => router.push(p.href)} />
            ))}
          </div>
        </section>

        <section className="kru-free-showcase">
          <div className="kru-free-showcase__heading">
            <div>
              <span className="kru-free-showcase__eyebrow"><Gift size={16} aria-hidden="true" /> เริ่มใช้ได้โดยไม่เสียค่าใช้จ่าย</span>
              <h2>ลองสื่อฟรีก่อนเลือกแพ็ก</h2>
              <p>บางรายการเปิดใช้ได้ทันที และบางรายการใช้เพียงบัญชีฟรีโดยไม่ต้องซื้อแพ็ก</p>
            </div>
            <div className="kru-free-showcase__actions">
              <Link href="/resources?access=free" className="kru-btn kru-btn--primary kru-btn--lg">
                ดูสื่อฟรีทั้งหมด <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/login?mode=signup" className="kru-btn kru-btn--secondary">
                สมัครสมาชิกฟรี
              </Link>
            </div>
          </div>

          {!samplesLoaded ? (
            <div role="status" className="kru-free-showcase__state">
              <span className="kru-free-showcase__state-icon"><Sparkles size={24} aria-hidden="true" /></span>
              <div>
                <strong>กำลังโหลดสื่อฟรี</strong>
                <p>ครูอรรี่กำลังเลือกสื่อที่เปิดให้ใช้ได้จริงค่ะ</p>
              </div>
            </div>
          ) : freeSamples.length > 0 ? (
            <div className="kru-sample-grid">
              {freeSamples.map((sample) => (
                <Link key={sample.id} href={`/resources/${sample.id}`} className="kru-card kru-sample-card">
                  <div className="kru-sample-card__cover">
                    <PublicResourceCover
                      title={sample.title}
                      url={sample.coverImageUrl}
                      deliveryMode={sample.affordance}
                      fallback="neutral"
                      style={{ aspectRatio: "1 / 1" }}
                    />
                    <span className="kru-sample-card__free-badge">ใช้ฟรี</span>
                    {sample.isNew && <span className="kru-resource-new-badge">ใหม่</span>}
                  </div>
                  <div className="kru-sample-card__body">
                    <span>เปิดดูรายละเอียดได้ทันที</span>
                    <h3>{sample.title}</h3>
                    <p>{sample.meta || sample.description || "สื่อพร้อมใช้สำหรับห้องเรียน"}</p>
                    <strong>ดูรายละเอียด <ArrowRight size={15} aria-hidden="true" /></strong>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div role="status" className="kru-free-showcase__state">
              <span className="kru-free-showcase__state-icon"><Gift size={24} aria-hidden="true" /></span>
              <div>
                <strong>กำลังเตรียมสื่อฟรีชุดใหม่</strong>
                <p>ยังไม่มีสื่อฟรีที่เผยแพร่ในขณะนี้ คุณครูเปิดดูคลังทั้งหมดหรือสมัครบัญชีไว้ก่อนได้ค่ะ</p>
              </div>
            </div>
          )}
        </section>

        <section className="kru-landing-plans">
          <h2>แพ็กเกจ</h2>
          <p className="kru-landing-plans__lead">
            เลือกแพ็กที่เหมาะกับคุณ สมัครสมาชิกฟรีแล้วอัปเกรดได้ทุกเมื่อ
          </p>
          {plansLoaded && plans.length === 0 && (
            <div role="status" className="kru-card" style={{ marginTop: "var(--sp-8)", padding: "var(--sp-7)", textAlign: "center" }}>
              <p style={{ marginBottom: "var(--sp-4)" }}>ขณะนี้ยังแสดงแพ็กเกจไม่ได้ โปรดลองใหม่อีกครั้งในภายหลัง</p>
              <Button variant="secondary" onClick={() => { setPlansLoaded(false); setLoadAttempt((attempt) => attempt + 1); }}>
                ลองโหลดอีกครั้ง
              </Button>
            </div>
          )}
          <div className="kru-landing-plans__grid">
            {plans.map((plan) => {
              const intervalLabel = billingIntervalLabel(plan.billingInterval);
              return (
                <article key={plan.id} className={`kru-card kru-landing-plan ${plan.isPopular ? "kru-landing-plan--popular" : ""}`}>
                  <div className="kru-landing-plan__heading">
                    <h3>{plan.name}</h3>
                    {plan.isPopular && <span>ยอดนิยม</span>}
                  </div>
                  <div className="kru-landing-plan__price">
                    <strong>{plan.priceLabel}</strong>
                    {intervalLabel && <span>{intervalLabel}</span>}
                  </div>
                  {plan.note && <p className="kru-landing-plan__note">{plan.note}</p>}
                  {plan.id === "founder" && (
                    <div role="status" className="kru-landing-plan__capacity">
                      {founderCapacity ? (
                        <>
                          <strong>สมัครแล้ว {founderCapacity.used} คนจาก {founderCapacity.capacity}</strong>
                          <span>{founderCapacity.isFull ? "Founder 100 เต็มแล้ว" : `เหลืออีก ${founderCapacity.remaining} สิทธิ์`}</span>
                        </>
                      ) : (
                        <span>กำลังตรวจสอบจำนวนสิทธิ์ Founder</span>
                      )}
                    </div>
                  )}
                  <PlanBenefits benefits={plan.benefits ?? []} />
                  {plan.id !== "free" && (
                    plan.id === "founder" && founderCapacity?.isFull ? (
                      <button type="button" disabled className="kru-btn kru-btn--primary kru-btn--block kru-landing-plan__cta">
                        Founder 100 เต็มแล้ว
                      </button>
                    ) : plan.id === "founder" && founderCapacity === null ? (
                      <button type="button" disabled className="kru-btn kru-btn--primary kru-btn--block kru-landing-plan__cta">
                        กำลังตรวจสอบสิทธิ์ Founder
                      </button>
                    ) : (
                      <a href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="kru-btn kru-btn--primary kru-btn--block kru-landing-plan__cta">
                        <MessageCircle size={18} aria-hidden="true" /> สนใจอัปเกรด
                      </a>
                    )
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid var(--border-subtle)", padding: "var(--sp-7) var(--sp-5)", textAlign: "center", fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
        <div>KruAorry — สื่อการสอนและเครื่องมือสำหรับครูไทย</div>
        <div style={{ marginTop: 8, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/terms" style={{ color: "var(--text-muted)" }}>
            เงื่อนไขการใช้งาน
          </Link>
          <Link href="/privacy" style={{ color: "var(--text-muted)" }}>
            นโยบายความเป็นส่วนตัว
          </Link>
        </div>
      </footer>

      <style jsx>{`
        .kru-visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .kru-discovery-hero {
          overflow: hidden;
          background:
            radial-gradient(circle at 10% 10%, rgba(255,255,255,.92), transparent 30%),
            linear-gradient(145deg, var(--purple-50) 0%, var(--pink-50) 52%, var(--blue-50) 100%);
        }

        .kru-discovery-hero__grid {
          width: min(100%, var(--container-max));
          min-width: 0;
          margin: 0 auto;
          padding: clamp(48px, 7vw, 88px) var(--sp-5);
          display: grid;
          grid-template-columns: minmax(0, 1.14fr) minmax(300px, .86fr);
          align-items: center;
          gap: clamp(32px, 6vw, 76px);
        }

        .kru-discovery-hero__content {
          min-width: 0;
        }

        .kru-discovery-hero__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: var(--purple-700);
          font-size: var(--fs-14);
          font-weight: var(--fw-semibold);
        }

        .kru-discovery-hero h1 {
          max-width: 760px;
          margin-top: var(--sp-5);
          font-size: clamp(2.25rem, 5.2vw, 4.25rem);
          line-height: 1.08;
          letter-spacing: -.035em;
        }

        .kru-discovery-hero__lead {
          max-width: 660px;
          margin-top: var(--sp-5);
          color: var(--text-body);
          font-size: clamp(1rem, 2vw, 1.2rem);
          line-height: 1.75;
        }

        .kru-discovery-search {
          max-width: 760px;
          margin-top: var(--sp-7);
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: var(--sp-3);
          align-items: stretch;
        }

        .kru-discovery-search__field {
          min-width: 0;
          min-height: 54px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 var(--sp-5);
          border: 1px solid rgba(107, 76, 184, .2);
          border-radius: var(--r-button);
          background: rgba(255,255,255,.94);
          box-shadow: 0 14px 36px rgba(83, 54, 142, .09);
        }

        .kru-discovery-search__field:focus-within {
          box-shadow: var(--ring-focus), 0 14px 36px rgba(83, 54, 142, .09);
        }

        .kru-discovery-search__field input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--text-strong);
          font: inherit;
        }

        .kru-discovery-search__field input::placeholder {
          color: var(--text-muted);
        }

        .kru-discovery-hero__secondary {
          max-width: 760px;
          margin-top: var(--sp-5);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          color: var(--text-muted);
          font-size: var(--fs-13);
        }

        .kru-discovery-hero__secondary a,
        .kru-discovery-results__heading > a {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: var(--fw-semibold);
        }

        .kru-discovery-results {
          width: min(100%, var(--container-max));
          margin: 0 auto;
          padding: var(--sp-10) var(--sp-5) var(--sp-4);
        }

        .kru-discovery-results__heading {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: var(--sp-5);
          flex-wrap: wrap;
        }

        .kru-discovery-results__heading h2 {
          margin-top: var(--sp-2);
          font-size: clamp(1.75rem, 4vw, var(--fs-30));
        }

        .kru-discovery-results__heading p:not(.kru-discovery-results__eyebrow) {
          margin-top: var(--sp-2);
          color: var(--text-muted);
        }

        .kru-discovery-results__eyebrow {
          color: var(--purple-700);
          font-size: var(--fs-13);
          font-weight: var(--fw-semibold);
        }

        .kru-discovery-results__status {
          margin-top: var(--sp-6);
          padding: var(--sp-7);
          display: grid;
          gap: var(--sp-3);
          text-align: center;
          color: var(--text-muted);
        }

        .kru-discovery-results__grid {
          margin-top: var(--sp-6);
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 280px));
          gap: var(--gap-grid);
          justify-content: center;
          align-items: stretch;
        }

        .kru-discovery-result-card {
          min-width: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-xs);
          transition: transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
        }

        .kru-discovery-result-card:hover {
          transform: translateY(-3px);
          box-shadow: var(--shadow-md);
        }

        .kru-discovery-result-card__cover {
          position: relative;
          display: block;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          background: var(--wash-hero);
        }

        .kru-discovery-result-card__body {
          flex: 1;
          padding: var(--sp-5);
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
        }

        .kru-discovery-result-card__body h3 {
          min-height: 2.8em;
          display: -webkit-box;
          overflow: hidden;
          font-size: var(--fs-18);
          line-height: var(--lh-snug);
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .kru-discovery-result-card__body h3 a {
          color: inherit;
          text-decoration: none;
        }

        .kru-discovery-result-card__body h3 a:hover {
          color: var(--purple-700);
        }

        .kru-discovery-result-card__badge {
          width: fit-content;
          padding: 4px 10px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border-radius: var(--r-pill);
          background: var(--status-member-bg);
          color: var(--status-member-fg);
          font-size: var(--fs-13);
          font-weight: var(--fw-semibold);
        }

        .kru-discovery-result-card__badge--free {
          background: var(--status-success-bg);
          color: var(--status-success-fg);
        }

        .kru-resource-new-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 2;
          padding: 5px 10px;
          border: 1px solid rgba(255,255,255,.86);
          border-radius: var(--r-pill);
          background: var(--pink-600);
          box-shadow: var(--shadow-xs);
          color: white;
          font-size: var(--fs-12);
          font-weight: var(--fw-bold);
          line-height: 1;
        }

        .kru-free-showcase {
          max-width: var(--container-max);
          margin: 0 auto;
          padding: 0 var(--sp-5) var(--sp-13);
        }

        .kru-free-showcase__heading {
          padding: clamp(24px, 4vw, 40px);
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: var(--sp-7);
          flex-wrap: wrap;
          border: 1px solid rgba(47, 169, 124, .2);
          border-radius: var(--r-panel);
          background:
            radial-gradient(circle at 92% 12%, rgba(255,255,255,.92), transparent 34%),
            linear-gradient(135deg, var(--green-50), var(--blue-50));
        }

        .kru-free-showcase__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--status-success-fg);
          font-size: var(--fs-13);
          font-weight: var(--fw-bold);
        }

        .kru-free-showcase__heading h2 {
          margin-top: var(--sp-3);
          font-size: clamp(1.8rem, 4vw, var(--fs-30));
        }

        .kru-free-showcase__heading p {
          max-width: 620px;
          margin-top: var(--sp-3);
          color: var(--text-muted);
        }

        .kru-free-showcase__actions {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          flex-wrap: wrap;
        }

        .kru-free-showcase__actions a:hover {
          text-decoration: none;
        }

        .kru-free-showcase__actions .kru-btn--primary:hover {
          color: var(--white);
        }

        .kru-free-showcase__state {
          min-height: 150px;
          margin-top: var(--sp-6);
          padding: var(--sp-7);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--sp-5);
          border: 1px dashed var(--border-brand);
          border-radius: var(--r-card);
          background: var(--surface-card);
          color: var(--text-muted);
          text-align: left;
        }

        .kru-free-showcase__state strong {
          color: var(--text-strong);
          font-size: var(--fs-18);
        }

        .kru-free-showcase__state p {
          max-width: 580px;
          margin-top: 4px;
          font-size: var(--fs-14);
        }

        .kru-free-showcase__state-icon {
          width: 52px;
          height: 52px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: var(--r-lg);
          background: var(--green-50);
          color: var(--status-success-fg);
        }

        .kru-sample-grid {
          margin-top: var(--sp-7);
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 280px));
          gap: var(--gap-grid);
          justify-content: center;
          align-items: stretch;
        }

        .kru-sample-card {
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: inherit;
          text-decoration: none;
          box-shadow: var(--shadow-xs);
          transition: transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
        }

        .kru-sample-card:hover {
          color: inherit;
          text-decoration: none;
          transform: translateY(-3px);
          box-shadow: var(--shadow-md);
        }

        .kru-sample-card__cover {
          position: relative;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          background: var(--wash-hero);
        }

        .kru-sample-card__free-badge {
          position: absolute;
          right: 10px;
          bottom: 10px;
          z-index: 2;
          padding: 5px 10px;
          border: 1px solid rgba(255,255,255,.88);
          border-radius: var(--r-pill);
          background: rgba(234, 248, 242, .96);
          box-shadow: var(--shadow-xs);
          color: var(--status-success-fg);
          font-size: var(--fs-12);
          font-weight: var(--fw-bold);
        }

        .kru-sample-card__body {
          flex: 1;
          padding: var(--sp-5);
          display: flex;
          flex-direction: column;
        }

        .kru-sample-card__body > span {
          color: var(--status-success-fg);
          font-size: var(--fs-12);
          font-weight: var(--fw-semibold);
        }

        .kru-sample-card__body h3 {
          min-height: 2.8em;
          margin-top: var(--sp-3);
          display: -webkit-box;
          overflow: hidden;
          font-size: var(--fs-18);
          line-height: var(--lh-snug);
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .kru-sample-card__body p {
          min-height: 4.5em;
          margin-top: var(--sp-3);
          display: -webkit-box;
          overflow: hidden;
          color: var(--text-muted);
          font-size: var(--fs-14);
          line-height: 1.5;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }

        .kru-sample-card__body > strong {
          margin-top: auto;
          padding-top: var(--sp-4);
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--purple-700);
          font-size: var(--fs-14);
        }

        .kru-landing-plans {
          max-width: var(--container-max);
          margin: 0 auto;
          padding: 0 var(--sp-5) var(--sp-13);
        }

        .kru-landing-plans > h2 {
          font-size: var(--fs-30);
          text-align: center;
        }

        .kru-landing-plans__lead {
          margin-top: var(--sp-3);
          color: var(--text-muted);
          text-align: center;
        }

        .kru-landing-plans__grid {
          margin-top: var(--sp-8);
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr));
          gap: var(--gap-grid);
          align-items: stretch;
        }

        .kru-landing-plan {
          position: relative;
          padding: var(--sp-7);
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
          box-shadow: var(--shadow-xs);
        }

        .kru-landing-plan--popular {
          border-color: var(--border-brand);
          box-shadow: var(--shadow-md);
        }

        .kru-landing-plan__heading {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-3);
        }

        .kru-landing-plan__heading h3 {
          font-size: var(--fs-20);
        }

        .kru-landing-plan__heading span {
          padding: 4px 10px;
          border-radius: var(--r-pill);
          background: var(--status-success-bg);
          color: var(--status-success-fg);
          font-size: var(--fs-12);
          font-weight: var(--fw-bold);
          white-space: nowrap;
        }

        .kru-landing-plan__price {
          display: flex;
          align-items: baseline;
          gap: var(--sp-2);
          flex-wrap: wrap;
        }

        .kru-landing-plan__price strong {
          color: var(--text-strong);
          font-family: var(--font-display);
          font-size: var(--fs-30);
          line-height: 1.2;
        }

        .kru-landing-plan__price span,
        .kru-landing-plan__note {
          color: var(--text-muted);
          font-size: var(--fs-13);
        }

        .kru-landing-plan__capacity {
          padding: var(--sp-4);
          display: grid;
          gap: 4px;
          border-radius: var(--r-md);
          background: var(--purple-50);
          color: var(--text-body);
          font-size: var(--fs-13);
        }

        .kru-landing-plan__capacity strong {
          color: var(--text-strong);
        }

        .kru-landing-plan__cta {
          margin-top: auto;
        }

        .kru-landing-plan a.kru-landing-plan__cta:hover {
          color: var(--white);
          text-decoration: none;
        }

        @media (max-width: 860px) {
          .kru-discovery-hero__grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }

        @media (max-width: 560px) {
          .kru-discovery-hero__grid {
            padding-top: var(--sp-9);
            padding-bottom: var(--sp-9);
          }

          .kru-discovery-hero h1 {
            font-size: clamp(2.05rem, 11.4vw, 3rem);
          }

          .kru-discovery-search {
            grid-template-columns: minmax(0, 1fr);
          }

          .kru-discovery-results__heading {
            align-items: flex-start;
          }

          .kru-free-showcase__heading {
            padding: var(--sp-6);
          }

          .kru-free-showcase__actions,
          .kru-free-showcase__actions a {
            width: 100%;
          }

          .kru-free-showcase__state {
            align-items: flex-start;
            justify-content: flex-start;
            text-align: left;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .kru-discovery-result-card,
          .kru-sample-card {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
