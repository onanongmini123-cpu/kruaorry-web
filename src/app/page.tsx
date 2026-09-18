"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, FileSpreadsheet, Timer, CheckCircle2 } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, PillarTile } from "@/components/ui";
import { fetchPlans, fetchPublishedResources, type Plan, type Resource } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { publicCoverUrl } from "@/lib/resourceVisibility";

const PILLARS = [
  { icon: FolderOpen, tone: "purple" as const, title: "คลังสื่อพร้อมสอน", desc: "ดาวน์โหลดแล้วใช้สอนได้เลย ไม่ต้องทำเอง" },
  { icon: FileSpreadsheet, tone: "pink" as const, title: "เทมเพลต Google พร้อมใช้", desc: "ทำสำเนา Google Sheets, Docs, Slides และฟอร์มไปใช้ได้ทันที" },
  { icon: Timer, tone: "blue" as const, title: "เครื่องมือในห้องเรียน", desc: "จับเวลา สุ่มชื่อ จับกลุ่ม เปิดใช้ได้ทันที" },
];

const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function LandingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [freeSamples, setFreeSamples] = useState<Resource[]>([]);
  const [samplesLoaded, setSamplesLoaded] = useState(!isSupabaseConfigured);
  const [plansLoaded, setPlansLoaded] = useState(!isSupabaseConfigured);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const supabase = createClient();
    fetchPlans(supabase)
      .then((rows) => {
        if (!active) return;
        setPlans(rows);
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
    fetchPublishedResources(createClient())
      .then((rows) => {
        if (active) setFreeSamples(rows.filter((row) => row.free && publicCoverUrl(row.coverImageUrl)).slice(0, 3));
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
          <Link href="/login">
            <Button variant="ghost" size="sm">
              เข้าสู่ระบบ
            </Button>
          </Link>
          <Link href="/login?mode=signup">
            <Button size="sm">สมัครฟรี</Button>
          </Link>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <section style={{ background: "var(--wash-hero)" }}>
          <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "var(--sp-13) var(--sp-5)", textAlign: "center" }}>
            <Mascot size={72} />
            <div style={{ margin: "0 auto" }}>
              <h1
                style={{
                  marginTop: "var(--sp-6)",
                  fontSize: "var(--fs-44)",
                  lineHeight: "var(--lh-tight)",
                  maxWidth: 720,
                  marginInline: "auto",
                }}
              >
                ครูมีงานเยอะพออยู่แล้ว ให้ครูอรรี่ช่วย
              </h1>
              <p style={{ marginTop: "var(--sp-5)", fontSize: "var(--fs-18)", color: "var(--text-body)", maxWidth: 560, marginInline: "auto" }}>
                สื่อพร้อมสอนภาษาไทย เทมเพลต Google พร้อมใช้ และเครื่องมือในห้องเรียน ใช้งานง่าย ดาวน์โหลดแล้วสอนได้เลย
              </p>
              <div style={{ marginTop: "var(--sp-8)", display: "flex", gap: "var(--sp-4)", justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/resources">
                  <Button size="lg">{freeSamples.length > 0 ? "ดูตัวอย่างสื่อฟรี" : "สำรวจคลังสื่อ"}</Button>
                </Link>
                <Link href="/login?mode=signup">
                  <Button size="lg" variant="secondary">
                    สมัครสมาชิกฟรี
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "var(--sp-12) var(--sp-5)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
            {PILLARS.map((p) => (
              <PillarTile key={p.title} icon={p.icon} tone={p.tone} title={p.title} description={p.desc} onClick={() => router.push("/resources")} />
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
            <div style={{ marginTop: "var(--sp-7)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
              {freeSamples.map((sample) => (
                <Link key={sample.id} href={`/resources/${sample.id}`} className="kru-card" style={{ display: "block", overflow: "hidden", textDecoration: "none", color: "inherit" }}>
                  <div style={{ height: 150, background: "var(--wash-hero)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                    {sample.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sample.coverImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : <FolderOpen aria-hidden="true" size={36} />}
                  </div>
                  <div style={{ padding: "var(--sp-5)" }}>
                    <span style={{ color: "var(--status-success-fg)", fontSize: "var(--fs-13)", fontWeight: "var(--fw-semibold)" }}>ตัวอย่างฟรี</span>
                    <h3 style={{ fontSize: "var(--fs-18)", marginTop: "var(--sp-3)" }}>{sample.title}</h3>
                    <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-14)", marginTop: "var(--sp-3)" }}>{sample.meta}</p>
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
                <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "var(--fs-14)", listStyle: "none", marginLeft: -20 }}>
                      <CheckCircle2 size={16} style={{ color: "var(--status-success-fg)", marginTop: 2, flex: "0 0 auto" }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
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
    </div>
  );
}
