"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderOpen, Sparkles, Timer, CheckCircle2 } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, PillarTile } from "@/components/ui";
import { fetchPlans, type Plan } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";

const PILLARS = [
  { icon: FolderOpen, tone: "purple" as const, title: "คลังสื่อพร้อมสอน", desc: "ดาวน์โหลดแล้วใช้สอนได้เลย ไม่ต้องทำเอง" },
  { icon: Sparkles, tone: "pink" as const, title: "เครื่องมือ AI", desc: "บอกหัวข้อ ได้ข้อสอบและแผนการสอนพร้อมใช้" },
  { icon: Timer, tone: "blue" as const, title: "เครื่องมือในห้องเรียน", desc: "จับเวลา สุ่มชื่อ จับกลุ่ม เปิดใช้ได้ทันที" },
];

export default function LandingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    const supabase = createClient();
    fetchPlans(supabase).then(setPlans);
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
          <Link href="/login">
            <Button size="sm">เริ่มใช้ฟรี</Button>
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
                สื่อพร้อมสอนภาษาไทย เครื่องมือ AI และเครื่องมือในห้องเรียน ใช้งานง่าย ดาวน์โหลดแล้วสอนได้เลย
              </p>
              <div style={{ marginTop: "var(--sp-8)", display: "flex", gap: "var(--sp-4)", justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/login">
                  <Button size="lg">เริ่มใช้ฟรี</Button>
                </Link>
                <Link href="/app">
                  <Button size="lg" variant="secondary">
                    เข้าสู่แอปสำหรับครู
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "var(--sp-12) var(--sp-5)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
            {PILLARS.map((p) => (
              <PillarTile key={p.title} icon={p.icon} tone={p.tone} title={p.title} description={p.desc} />
            ))}
          </div>
        </section>

        <section style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "0 var(--sp-5) var(--sp-13)" }}>
          <h2 style={{ fontSize: "var(--fs-30)", textAlign: "center" }}>แพ็กเกจ</h2>
          <p style={{ marginTop: "var(--sp-3)", textAlign: "center", color: "var(--text-muted)" }}>
            เลือกแพ็กที่เหมาะกับคุณ สมัครสมาชิกฟรีแล้วอัปเกรดได้ทุกเมื่อ
          </p>
          <div style={{ marginTop: "var(--sp-8)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
            {plans.map((plan) => (
              <div key={plan.id} className="kru-card" style={{ padding: "var(--sp-7)", display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-20)", fontWeight: "var(--fw-semibold)" }}>{plan.name}</div>
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
