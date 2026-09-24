"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  FolderOpen,
  Lock,
  MessageCircle,
  Search,
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

const PILLARS = [
  { icon: FolderOpen, tone: "purple" as const, title: "คลังสื่อพร้อมสอน", desc: "ดาวน์โหลดแล้วใช้สอนได้เลย ไม่ต้องทำเอง", href: "/resources" },
  { icon: FileSpreadsheet, tone: "pink" as const, title: "เทมเพลต Google พร้อมใช้", desc: "ทำสำเนา Google Sheets, Docs, Slides และฟอร์มไปใช้ได้ทันที", href: resourceDiscoveryHref("/resources", { query: "Google" }) },
  { icon: Timer, tone: "blue" as const, title: "เครื่องมือในห้องเรียน", desc: "จับเวลา สุ่มชื่อ จับกลุ่ม เปิดใช้ได้ทันที", href: resourceDiscoveryHref("/resources", { query: "เครื่องมือ" }) },
];

type LandingResource = Resource & { isFree: boolean; gradeLevels: string[] };

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
    () => discoverableResources.filter((resource) => resource.free).slice(0, 3),
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

            {!hasSearched && discoverableResources.length > 0 && (
              <div className="kru-cover-showcase" role="list" aria-label="สื่อที่เผยแพร่ล่าสุด">
                {discoverableResources.slice(0, 4).map((resource, index) => (
                  <Link
                    role="listitem"
                    href={`/resources/${resource.id}`}
                    aria-label={`ดูรายละเอียด ${resource.title}`}
                    className={`kru-cover-showcase__card kru-cover-showcase__card--${index + 1}`}
                    key={resource.id}
                  >
                    <div className="kru-cover-showcase__cover">
                      <PublicResourceCover
                        title={resource.title}
                        url={resource.coverImageUrl}
                        deliveryMode={resource.affordance}
                        fallback="neutral"
                        style={{ aspectRatio: "1 / 1" }}
                      />
                      {resource.isNew && <span className="kru-resource-new-badge">ใหม่</span>}
                    </div>
                    <span>{resource.title}</span>
                  </Link>
                ))}
                <div className="kru-cover-showcase__glow kru-cover-showcase__glow--pink" />
                <div className="kru-cover-showcase__glow kru-cover-showcase__glow--blue" />
              </div>
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
                {discoveryMatches.map((resource) => (
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
                      <span className={resource.free ? "kru-discovery-result-card__badge kru-discovery-result-card__badge--free" : "kru-discovery-result-card__badge"}>
                        {resource.free ? "ใช้ได้ฟรี" : <><Lock size={14} aria-hidden="true" /> สำหรับ {resource.requiredPlanNames.join(" หรือ ") || "แพ็กสมาชิก"}</>}
                      </span>
                      <h3><Link href={`/resources/${resource.id}`}>{resource.title}</Link></h3>
                      <ExpandableResourceDescription
                        title={resource.title}
                        description={resource.description || resource.meta}
                        fallback="ดูรายละเอียดและสิทธิ์การใช้งานของสื่อนี้"
                      />
                    </div>
                  </article>
                ))}
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

        <section style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "0 var(--sp-5) var(--sp-13)" }}>
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "var(--sp-5)", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: "var(--fs-30)" }}>ลองดูก่อนสมัคร</h2>
              <p style={{ color: "var(--text-muted)", marginTop: "var(--sp-3)" }}>ตัวอย่างจากสื่อที่เผยแพร่จริง ดูรายละเอียดได้โดยไม่ต้องมีบัญชี</p>
            </div>
            <Link href="/resources" style={{ color: "var(--brand)", fontWeight: "var(--fw-semibold)" }}>ดูคลังสื่อทั้งหมด →</Link>
          </div>
          {freeSamples.length > 0 ? (
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
                    {sample.isNew && <span className="kru-resource-new-badge">ใหม่</span>}
                  </div>
                  <div className="kru-sample-card__body">
                    <span style={{ color: "var(--status-success-fg)", fontSize: "var(--fs-13)", fontWeight: "var(--fw-semibold)" }}>ตัวอย่างฟรี</span>
                    <h3>{sample.title}</h3>
                    <p>{sample.meta}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : samplesLoaded ? (
            <div role="status" className="kru-card" style={{ marginTop: "var(--sp-7)", padding: "var(--sp-7)", textAlign: "center", color: "var(--text-muted)" }}>
              ยังแสดงตัวอย่างฟรีไม่ได้ในขณะนี้ ดูรายการสื่อทั้งหมดหรือกลับมาตรวจใหม่ภายหลัง
            </div>
          ) : (
            <p role="status" style={{ marginTop: "var(--sp-7)", color: "var(--text-muted)" }}>กำลังโหลดตัวอย่างสื่อ...</p>
          )}
        </section>

        <section style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "0 var(--sp-5) var(--sp-13)" }}>
          <h2 style={{ fontSize: "var(--fs-30)", textAlign: "center" }}>แพ็กเกจ</h2>
          <p style={{ marginTop: "var(--sp-3)", textAlign: "center", color: "var(--text-muted)" }}>
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
          <div style={{ marginTop: "var(--sp-8)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
            {plans.map((plan) => (
              <div key={plan.id} className="kru-card" style={{ padding: "var(--sp-7)", display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-20)", fontWeight: "var(--fw-semibold)" }}>{plan.name}</div>
                {plan.isPopular && <div style={{ alignSelf: "flex-start", borderRadius: "var(--r-pill)", padding: "4px 10px", background: "var(--status-success-bg)", color: "var(--status-success-fg)", fontSize: "var(--fs-13)", fontWeight: "var(--fw-semibold)" }}>ยอดนิยม</div>}
                <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-30)", fontWeight: "var(--fw-bold)" }}>{plan.priceLabel}</div>
                <p style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{plan.note}</p>
                {plan.id === "founder" && (
                  <div role="status" style={{ padding: "var(--sp-4)", borderRadius: "var(--r-md)", background: "var(--purple-50)", display: "grid", gap: 4, fontSize: "var(--fs-13)" }}>
                    {founderCapacity ? (
                      <>
                        <strong style={{ color: "var(--text-strong)" }}>สมัครแล้ว {founderCapacity.used} คนจาก {founderCapacity.capacity}</strong>
                        <span>{founderCapacity.isFull ? "Founder 100 เต็มแล้ว" : `เหลืออีก ${founderCapacity.remaining} สิทธิ์`}</span>
                      </>
                    ) : (
                      <span>กำลังตรวจสอบจำนวนสิทธิ์ Founder</span>
                    )}
                  </div>
                )}
                <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "var(--fs-14)", listStyle: "none", marginLeft: -20 }}>
                      <CheckCircle2 size={16} style={{ color: "var(--status-success-fg)", marginTop: 2, flex: "0 0 auto" }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {plan.id !== "free" && (
                  plan.id === "founder" && founderCapacity?.isFull ? (
                    <button type="button" disabled className="kru-btn kru-btn--primary kru-btn--block" style={{ marginTop: "auto" }}>
                      Founder 100 เต็มแล้ว
                    </button>
                  ) : plan.id === "founder" && founderCapacity === null ? (
                    <button type="button" disabled className="kru-btn kru-btn--primary kru-btn--block" style={{ marginTop: "auto" }}>
                      กำลังตรวจสอบสิทธิ์ Founder
                    </button>
                  ) : (
                    <a href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="kru-btn kru-btn--primary kru-btn--block" style={{ marginTop: "auto", textDecoration: "none" }}>
                      <MessageCircle size={18} aria-hidden="true" /> สนใจอัปเกรด
                    </a>
                  )
                )}
              </div>
            ))}
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

        .kru-cover-showcase {
          position: relative;
          min-width: 0;
          width: min(100%, 520px);
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: clamp(12px, 2vw, 20px);
          isolation: isolate;
        }

        .kru-cover-showcase__card {
          position: relative;
          z-index: 2;
          min-width: 0;
          width: 100%;
          overflow: hidden;
          border: 5px solid rgba(255,255,255,.92);
          border-radius: 20px;
          background: var(--surface-card);
          box-shadow: 0 18px 44px rgba(66, 43, 116, .17);
          color: inherit;
          text-decoration: none;
          animation: kru-cover-float 5.8s ease-in-out infinite;
        }

        .kru-cover-showcase__card:focus-visible {
          outline: 3px solid var(--brand);
          outline-offset: 4px;
        }

        .kru-cover-showcase__cover {
          position: relative;
          aspect-ratio: 1 / 1;
          overflow: hidden;
        }

        .kru-cover-showcase__card > span {
          display: block;
          overflow: hidden;
          padding: 11px 13px;
          color: var(--text-strong);
          font-size: var(--fs-13);
          font-weight: var(--fw-semibold);
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .kru-cover-showcase__card--2 { margin-top: 28px; animation-delay: -.9s; }
        .kru-cover-showcase__card--3 { animation-delay: -1.8s; }
        .kru-cover-showcase__card--4 { margin-top: 28px; animation-delay: -2.7s; }

        .kru-cover-showcase__glow {
          position: absolute;
          z-index: 0;
          width: 180px;
          height: 180px;
          border-radius: 999px;
          filter: blur(8px);
          opacity: .52;
        }

        .kru-cover-showcase__glow--pink { top: 0; right: 4%; background: var(--pink-200); }
        .kru-cover-showcase__glow--blue { bottom: 0; left: 3%; background: var(--blue-200); }

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

        .kru-sample-card__body {
          flex: 1;
          padding: var(--sp-5);
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

        @keyframes kru-cover-float {
          0%, 100% { translate: 0 0; }
          50% { translate: 0 -10px; }
        }

        @media (max-width: 860px) {
          .kru-discovery-hero__grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .kru-cover-showcase {
            width: min(100%, 580px);
            margin: 0 auto;
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

          .kru-cover-showcase__card {
            border-width: 4px;
            border-radius: 16px;
          }

          .kru-discovery-results__heading {
            align-items: flex-start;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .kru-cover-showcase__card {
            animation: none;
          }

          .kru-discovery-result-card,
          .kru-sample-card {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
