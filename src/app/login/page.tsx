"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, KeyRound, Eye, EyeOff, Globe, CheckCircle2 } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Input, Checkbox, IconButton } from "@/components/ui";

const POINTS = [
  "สื่อพร้อมสอนภาษาไทย ใช้ได้ทันที ไม่ต้องทำเอง",
  "AI ช่วยออกข้อสอบ ตรวจงาน และเขียนแผนการสอน",
  "เครื่องมือในห้องเรียน จับเวลา สุ่มชื่อ จับกลุ่ม",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  // This build has no backend yet (fresh start, per the owner — see
  // sampleData.ts). Sign-in is a UI preview: it simulates success and
  // drops into the sample teacher app rather than pretending to check a
  // real password.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    window.setTimeout(() => {
      router.push("/app");
    }, 500);
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr" }} className="kru-login-grid">
      <div className="kru-login-brand" style={{ background: "var(--wash-hero)", padding: "var(--sp-9)", display: "none", flexDirection: "column", justifyContent: "center" }}>
        <Mascot size={72} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-24)", fontWeight: "var(--fw-bold)", marginTop: "var(--sp-5)" }}>KruAorry</div>
        <h1 style={{ marginTop: "var(--sp-4)", fontSize: "var(--fs-36)" }}>
          ครูมีงานเยอะพออยู่แล้ว
          <br />
          ให้ครูอรรี่ช่วย
        </h1>
        <div style={{ display: "grid", gap: "var(--sp-4)", marginTop: "var(--sp-7)" }}>
          {POINTS.map((p) => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", fontSize: "var(--fs-16)" }}>
              <CheckCircle2 size={20} style={{ color: "var(--purple-600)", flex: "0 0 auto" }} />
              <span>{p}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "var(--sp-7) var(--sp-5)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
          <h2 style={{ fontSize: "var(--fs-30)" }}>เข้าสู่ระบบ</h2>
          <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", fontSize: "var(--fs-14)", color: "var(--status-warning-fg)", background: "var(--status-warning-bg)", padding: "10px 14px", borderRadius: "var(--r-md)" }}>
            ตัวอย่างหน้าจอเท่านั้น — ยังไม่เชื่อมกับระบบสมาชิกจริง กดเข้าสู่ระบบเพื่อดูตัวอย่างแอปสำหรับครู
          </p>
          <div style={{ display: "grid", gap: "var(--sp-4)" }}>
            <Button variant="secondary" size="lg" block icon={Globe} type="button">
              เข้าสู่ระบบด้วย Google
            </Button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", margin: "var(--sp-7) 0" }}>
            <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
            <span style={{ fontSize: "var(--fs-14)", color: "var(--text-faint)" }}>หรือใช้อีเมล</span>
            <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
          </div>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--sp-5)" }}>
            <Input label="อีเมล" type="email" icon={Mail} placeholder="napha@school.ac.th" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input
              label="รหัสผ่าน"
              type={showPassword ? "text" : "password"}
              icon={KeyRound}
              placeholder="รหัสผ่านของครู"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              trailing={<IconButton icon={showPassword ? EyeOff : Eye} label="แสดงรหัสผ่าน" onClick={() => setShowPassword((v) => !v)} />}
            />
            <Checkbox label="จำการเข้าสู่ระบบไว้" checked={remember} onChange={setRemember} />
            <Button size="lg" block loading={loading} type="submit">
              เข้าสู่ระบบ
            </Button>
          </form>
        </div>
      </div>
      <style>{`
        @media (min-width: 900px) {
          .kru-login-grid { grid-template-columns: 1fr 1fr !important; }
          .kru-login-brand { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
