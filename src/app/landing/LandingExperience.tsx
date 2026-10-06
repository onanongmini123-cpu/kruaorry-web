"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Gamepad2,
  Gift,
  Presentation,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, ResourceCard } from "@/components/ui";
import { fetchFounderCapacity, fetchPlans, fetchPublishedResources, type Plan, type Resource } from "@/lib/data";
import type { LandingData } from "@/lib/landingData";
import { createClient } from "@/lib/supabase/client";
import { filterDiscoveredResources, resourceDiscoveryHref } from "@/lib/resourceDiscovery";
import { publicCoverUrl } from "@/lib/resourceVisibility";
import type { FounderCapacity } from "@/lib/founderCapacity";
import {
  fetchMembershipSchemaReadiness,
  type MembershipSchemaReadiness,
} from "@/lib/membershipSchemaReadiness";
import { FeaturedResourceCarousel } from "@/app/landing/FeaturedResourceCarousel";
import { PricingSection, type PricingCta } from "@/app/landing/PricingSection";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { TrackOnVisible } from "@/components/analytics/TrackOnVisible";
import { trackEvent } from "@/lib/analytics";
import { FREE_SIGNUP_HREF } from "@/lib/authReturnPath";
import { ACCESS_TIER_DESCRIPTION, ACCESS_TIER_LABEL, accessTier } from "@/lib/resourceAccess";
import { resourceHref } from "@/lib/resourceUrl";
import {
  initialPublicAuthState,
  observePublicAuthState,
  publicFreeAccountAction,
  publicHeaderActions,
} from "@/lib/publicAuthState";

// Four ways in. Each card is a real link (keyboard focusable, opens in the
// same tab, works without JavaScript). Destinations only use filters the
// library already understands.
const ENTRY_CARDS = [
  { icon: Gamepad2, tone: "purple", title: "เกมในห้องเรียน", desc: "เกมสนุกที่เล่นได้ทั้งห้อง ฝึกคำศัพท์ คิดเลข และอื่น ๆ", href: resourceDiscoveryHref("/resources", { query: "เกม" }) },
  { icon: Presentation, tone: "pink", title: "สื่อพร้อมสอน", desc: "เปิดใช้หรือดาวน์โหลดแล้วสอนได้เลย ไม่ต้องทำเอง", href: "/resources" },
  { icon: Wrench, tone: "blue", title: "เครื่องมือครู", desc: "จับเวลา สุ่มชื่อ จับกลุ่ม และเทมเพลต Google พร้อมใช้", href: resourceDiscoveryHref("/resources", { query: "เครื่องมือ" }) },
  { icon: Crown, tone: "gold", title: "Teacher Pro", desc: "ดูสิทธิ์และราคาของแพ็กสำหรับใช้สื่อและเกมอย่างเต็มรูปแบบ", href: "#pricing" },
] as const;

const ACCESS_LEGEND = ["free", "member", "pro"] as const;

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

export function LandingExperience({ initial }: { initial: LandingData }) {
  const [plans, setPlans] = useState<Plan[]>(initial.plans);
  const [founderCapacity, setFounderCapacity] = useState<FounderCapacity | null>(initial.founderCapacity);
  const [membershipSchemaReadiness, setMembershipSchemaReadiness] = useState<MembershipSchemaReadiness>(
    initial.loaded ? initial.readiness : isSupabaseConfigured ? "checking" : "unavailable",
  );
  const [resources, setResources] = useState<Resource[]>(initial.resources);
  // Rendered on the server: when the first response already carries the data
  // there is nothing to wait for and no loading placeholder to show.
  const [samplesLoaded, setSamplesLoaded] = useState(initial.loaded || !isSupabaseConfigured);
  const [plansLoaded, setPlansLoaded] = useState(initial.loaded || !isSupabaseConfigured);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [discoveryInput, setDiscoveryInput] = useState("");
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [publicAuthState, setPublicAuthState] = useState(() => initialPublicAuthState(isSupabaseConfigured));

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
  const headerActions = publicHeaderActions(publicAuthState);
  const freeAccountAction = publicFreeAccountAction(publicAuthState);

  const handleDiscoverySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = discoveryInput.trim().slice(0, 100);
    setDiscoveryQuery(query);
    setHasSearched(true);
    trackEvent("search", {
      source: "home",
      term: query,
      query_length: query.length,
      results_count: filterDiscoveredResources(discoverableResources, { query }).length,
    });
  };

  const handleSignupClick = (source: string) => {
    // Only a visitor who is not signed in is starting to sign up.
    if (freeAccountAction?.href === FREE_SIGNUP_HREF) trackEvent("signup_start", { source });
  };

  const handlePricingClick = (cta: PricingCta) => {
    if (cta === "free_signup") handleSignupClick("pricing");
    else trackEvent("upgrade_click", { source: "pricing", plan_id: cta === "founder_offer" ? "founder" : "teacher" });
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    return observePublicAuthState(createClient().auth, setPublicAuthState);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Server-rendered data is already in state; only fetch when it was not
    // available (outage at render time) or after an explicit retry.
    if (initial.loaded && loadAttempt === 0) return;
    let active = true;
    const supabase = createClient();
    Promise.all([
      fetchPlans(supabase),
      fetchMembershipSchemaReadiness(supabase),
      fetchFounderCapacity(supabase),
    ])
      .then(([rows, readiness, capacity]) => {
        if (!active) return;
        setPlans(rows);
        setMembershipSchemaReadiness(readiness);
        setFounderCapacity(readiness === "ready" ? capacity : null);
        setPlansLoaded(true);
      })
      .catch(() => {
        if (active) setPlansLoaded(true);
      });
    return () => { active = false; };
  }, [loadAttempt, initial.loaded]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const supabase = createClient();
    const refreshFounderCapacity = () => {
      void fetchMembershipSchemaReadiness(supabase).then(async (readiness) => {
        if (!active) return;
        setMembershipSchemaReadiness(readiness);
        const capacity = readiness === "ready" ? await fetchFounderCapacity(supabase) : null;
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
    if (!isSupabaseConfigured || initial.loaded) return;
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
  }, [initial.loaded]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TrackOnMount event="home_view" />
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
          className="kru-public-header__inner"
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
          {publicAuthState === "checking" ? (
            <span className="kru-public-auth-placeholder kru-public-auth-placeholder--header" role="status">
              <span className="kru-visually-hidden">กำลังตรวจสอบบัญชีสมาชิก</span>
            </span>
          ) : headerActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`kru-btn kru-btn--${action.emphasis} kru-btn--sm`}
              onClick={() => { if (action.href === FREE_SIGNUP_HREF) trackEvent("signup_start", { source: "home_header" }); }}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <section className="kru-discovery-hero">
          <div className="kru-discovery-hero__grid">
            <div className="kru-discovery-hero__content">
              <div className="kru-discovery-hero__eyebrow">
                <Mascot size={40} />
                <span>วันนี้มีอะไรให้ครูอรรี่ช่วยคะ?</span>
              </div>
              <h1>เกม สื่อ และเครื่องมือที่ช่วยให้ครูเตรียมสอนน้อยลง</h1>
              <p className="kru-discovery-hero__lead">
                ค้นหาสื่อ เกม และเครื่องมือสำหรับใช้ในห้องเรียน มีทั้งแบบใช้ฟรีและสำหรับสมาชิก Teacher Pro
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
                <Button size="lg" type="submit">ค้นหาสื่อและเกม</Button>
              </form>

              <div className="kru-discovery-hero__secondary">
                <Link href={resourceDiscoveryHref("/resources", { access: "free" })} className="kru-btn kru-btn--secondary">
                  ลองใช้ฟรี
                </Link>
                {freeAccountAction ? (
                  <Link href={freeAccountAction.href} onClick={() => handleSignupClick("home_hero")}>{freeAccountAction.label} <ArrowRight size={16} aria-hidden="true" /></Link>
                ) : (
                  <span className="kru-public-auth-placeholder kru-public-auth-placeholder--inline" aria-hidden="true" />
                )}
              </div>

              <ul className="kru-access-legend" aria-label="ความหมายของป้ายสิทธิ์">
                {ACCESS_LEGEND.map((tier) => (
                  <li key={tier}>
                    <strong>{ACCESS_TIER_LABEL[tier]}</strong>
                    <span>{ACCESS_TIER_DESCRIPTION[tier]}</span>
                  </li>
                ))}
              </ul>
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
                {discoveryMatches.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    title={resource.title}
                    description={resource.description}
                    meta={resource.meta}
                    category={resource.category}
                    deliveryMode={resource.affordance}
                    gradeLevels={resource.gradeLevels}
                    requiredPlanNames={resource.requiredPlanNames}
                    accessTier={accessTier(resource.accessMode)}
                    coverImageUrl={resource.coverImageUrl}
                    isNew={resource.isNew}
                    href={resourceHref(resource)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        <nav className="kru-entry-cards" aria-label="เริ่มต้นจากสิ่งที่ต้องการ">
          {ENTRY_CARDS.map((card) => (
            <Link key={card.title} href={card.href} className={`kru-card kru-entry-card kru-entry-card--${card.tone}`}>
              <span className="kru-entry-card__icon"><card.icon size={26} aria-hidden="true" /></span>
              <strong>{card.title}</strong>
              <span>{card.desc}</span>
              <span className="kru-entry-card__go">ดูเลย <ArrowRight size={16} aria-hidden="true" /></span>
            </Link>
          ))}
        </nav>

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
              {freeAccountAction ? (
                <Link href={freeAccountAction.href} className="kru-btn kru-btn--secondary" onClick={() => handleSignupClick("home_free_showcase")}>
                  {freeAccountAction.label}
                </Link>
              ) : (
                <span className="kru-public-auth-placeholder kru-public-auth-placeholder--button" aria-hidden="true" />
              )}
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
                <ResourceCard
                  key={sample.id}
                  title={sample.title}
                  description={sample.description}
                  meta={sample.meta}
                  category={sample.category}
                  deliveryMode={sample.affordance}
                  gradeLevels={sample.gradeLevels}
                  accessTier={accessTier(sample.accessMode)}
                  coverImageUrl={sample.coverImageUrl}
                  isNew={sample.isNew}
                  href={resourceHref(sample)}
                />
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

        <TrackOnVisible event="pricing_view" properties={{ source: "home" }}>
        <PricingSection
          plans={plans}
          loaded={plansLoaded}
          founder={membershipSchemaReadiness === "unavailable" ? null : { full: founderCapacity?.isFull === true }}
          membershipUnavailable={membershipSchemaReadiness === "unavailable"}
          freeAction={freeAccountAction
            ? { href: freeAccountAction.href, label: publicAuthState === "member" ? freeAccountAction.label : "สมัครฟรี" }
            : undefined}
          onRetry={() => { setPlansLoaded(false); setLoadAttempt((attempt) => attempt + 1); }}
          onCtaClick={handlePricingClick}
        />
        </TrackOnVisible>
      </main>

      <footer style={{ borderTop: "1px solid var(--border-subtle)", padding: "var(--sp-7) var(--sp-5)", textAlign: "center", fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
        <div>KruAorry — สื่อการสอนและเครื่องมือสำหรับครูไทย</div>
        <div style={{ marginTop: 8, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/terms" style={{ minHeight: "var(--tap-min)", display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}>
            เงื่อนไขการใช้งาน
          </Link>
          <Link href="/privacy" style={{ minHeight: "var(--tap-min)", display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}>
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

        .kru-public-auth-placeholder {
          display: inline-block;
          border-radius: var(--r-button);
          background: linear-gradient(100deg, var(--purple-50) 20%, var(--purple-100) 50%, var(--purple-50) 80%);
          background-size: 220% 100%;
          animation: kru-public-auth-pulse 1.4s ease-in-out infinite;
        }

        .kru-public-auth-placeholder--header {
          width: 132px;
          height: 36px;
          flex: 0 0 132px;
        }

        .kru-public-auth-placeholder--inline {
          width: 132px;
          height: 24px;
        }

        .kru-public-auth-placeholder--button {
          width: 148px;
          height: var(--tap-min);
        }

        @keyframes kru-public-auth-pulse {
          from { background-position: 100% 0; }
          to { background-position: -100% 0; }
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
          min-height: var(--tap-min, 44px);
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
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
          gap: var(--gap-grid);
          align-items: stretch;
        }

        .kru-access-legend {
          max-width: 760px;
          margin: var(--sp-6) 0 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--sp-3);
          list-style: none;
        }

        .kru-access-legend li {
          min-width: 0;
          padding: var(--sp-3) var(--sp-4);
          display: grid;
          gap: 2px;
          border-radius: var(--r-md);
          background: rgba(255, 255, 255, .72);
          font-size: var(--fs-13);
          line-height: var(--lh-snug);
          color: var(--text-muted);
        }

        .kru-access-legend strong {
          color: var(--text-strong);
          font-size: var(--fs-14);
        }

        .kru-entry-cards {
          width: min(100%, var(--container-max));
          margin: 0 auto;
          padding: var(--sp-10) var(--sp-5) var(--sp-4);
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--gap-grid);
        }

        :global(.kru-entry-card) {
          min-width: 0;
          min-height: 100%;
          padding: var(--sp-6);
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
          color: var(--text-body);
          text-decoration: none;
          transition: transform .15s ease, box-shadow .15s ease;
        }

        :global(.kru-entry-card:hover) {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
          text-decoration: none;
        }

        :global(.kru-entry-card:focus-visible) {
          outline: none;
          box-shadow: var(--ring-focus);
        }

        .kru-entry-card__icon {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: var(--r-md);
          background: var(--purple-100);
          color: var(--purple-700);
        }

        :global(.kru-entry-card--pink) .kru-entry-card__icon { background: var(--pink-100); color: var(--pink-700); }
        :global(.kru-entry-card--blue) .kru-entry-card__icon { background: var(--blue-100); color: var(--blue-700); }
        :global(.kru-entry-card--gold) .kru-entry-card__icon { background: var(--status-warning-bg); color: var(--status-warning-fg); }

        :global(.kru-entry-card) > strong {
          color: var(--text-strong);
          font-size: var(--fs-18);
        }

        :global(.kru-entry-card) > span:not(.kru-entry-card__icon):not(.kru-entry-card__go) {
          font-size: var(--fs-14);
          line-height: var(--lh-snug);
        }

        .kru-entry-card__go {
          margin-top: auto;
          padding-top: var(--sp-2);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-link);
          font-size: var(--fs-14);
          font-weight: var(--fw-semibold);
        }

        @media (max-width: 1000px) {
          .kru-entry-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 560px) {
          .kru-entry-cards { grid-template-columns: 1fr; padding-top: var(--sp-8); }
          .kru-access-legend { grid-template-columns: 1fr; }
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

        @media (max-width: 360px) {
          .kru-public-header__inner {
            padding-inline: var(--sp-3) !important;
            gap: var(--sp-2) !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .kru-public-auth-placeholder {
            transition: none;
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
