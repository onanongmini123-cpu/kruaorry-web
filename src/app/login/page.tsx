"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, KeyRound, Eye, EyeOff, Globe, CheckCircle2, User } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Input, Checkbox, IconButton } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const POINTS = [
  "สื่อพร้อมสอนภาษาไทย ใช้ได้ทันที ไม่ต้องทำเอง",
  "AI ช่วยออกข้อสอบ ตรวจงาน และเขียนแผนการสอน",
  "เครื่องมือในห้องเรียน จับเวลา สุ่มชื่อ จับกลุ่ม",
];

export const dynamic = "force-dynamic";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setLoading(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (!data.session) {
        setNotice("สมัครสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันตัวตนก่อนเข้าสู่ระบบ");
        setMode("signin");
        return;
      }
      router.push("/app");
      router.refresh();
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message === "Invalid login credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : signInError.message);
      return;
    }
    router.push("/app");
    router.refresh();
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("กรอกอีเมลก่อนกดลืมรหัสผ่าน");
      return;
    }
    setResetting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย");
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
          <h2 style={{ fontSize: "var(--fs-30)" }}>{mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิกครู"}</h2>
          <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>
            {mode === "signin" ? "ยังไม่มีบัญชี? " : "มีบัญชีอยู่แล้ว? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
              style={{ color: "var(--purple-600)", fontWeight: "var(--fw-semibold)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {mode === "signin" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
            </button>
          </p>

          {notice && (
            <p style={{ fontSize: "var(--fs-14)", color: "var(--status-success-fg)", background: "var(--status-success-bg)", padding: "10px 14px", borderRadius: "var(--r-md)", marginBottom: "var(--sp-5)" }}>
              {notice}
            </p>
          )}
          {error && (
            <p style={{ fontSize: "var(--fs-14)", color: "var(--status-danger-fg)", background: "var(--status-danger-bg)", padding: "10px 14px", borderRadius: "var(--r-md)", marginBottom: "var(--sp-5)" }}>
              {error}
            </p>
          )}

          <div style={{ display: "grid", gap: "var(--sp-4)" }}>
            <Button variant="secondary" size="lg" block icon={Globe} type="button" disabled title="เร็วๆ นี้">
              เข้าสู่ระบบด้วย Google (เร็วๆ นี้)
            </Button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", margin: "var(--sp-7) 0" }}>
            <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
            <span style={{ fontSize: "var(--fs-14)", color: "var(--text-faint)" }}>หรือใช้อีเมล</span>
            <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
          </div>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--sp-5)" }}>
            {mode === "signup" && (
              <Input label="ชื่อ-นามสกุล" icon={User} placeholder="ครูนภา ใจดี" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            )}
            <Input label="อีเมล" type="email" icon={Mail} placeholder="napha@school.ac.th" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input
              label="รหัสผ่าน"
              type={showPassword ? "text" : "password"}
              icon={KeyRound}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              trailing={<IconButton icon={showPassword ? EyeOff : Eye} label="แสดงรหัสผ่าน" onClick={() => setShowPassword((v) => !v)} />}
            />
            {mode === "signin" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Checkbox label="จำการเข้าสู่ระบบไว้" checked={remember} onChange={setRemember} />
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetting}
                  style={{ color: "var(--purple-600)", fontSize: "var(--fs-14)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {resetting ? "กำลังส่ง..." : "ลืมรหัสผ่าน?"}
                </button>
              </div>
            )}
            <Button size="lg" block loading={loading} type="submit">
              {mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
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
