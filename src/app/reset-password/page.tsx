"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

function LoadingSpinner() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <span className="kru-spin" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, border: "3px solid var(--border-subtle)", borderTopColor: "var(--brand)" }} />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

type Stage = "confirm" | "verifying" | "verified" | "error";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const [stage, setStage] = useState<Stage>(tokenHash || code ? "confirm" : "error");
  const [error, setError] = useState<string | null>(
    tokenHash || code ? null : "ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ใหม่จากหน้าเข้าสู่ระบบ"
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Verification only runs after an explicit human click, never automatically on
  // page load — the Supabase recovery link is single-use, and if the page
  // verified it on mount, an email client's automated link-prescan (which
  // fetches the URL to check it's safe) would silently burn the token before
  // the person ever clicks it, showing "otp_expired" on their real attempt.
  const handleConfirmLink = async () => {
    setStage("verifying");
    setError(null);

    if (tokenHash) {
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (verifyError) {
        setError("ลิงก์หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่จากหน้าเข้าสู่ระบบ");
        setStage("error");
        return;
      }
    } else if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setError("ลิงก์หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่จากหน้าเข้าสู่ระบบ");
        setStage("error");
        return;
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("ลิงก์หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่จากหน้าเข้าสู่ระบบ");
      setStage("error");
      return;
    }
    setStage("verified");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (password !== confirmPassword) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    window.setTimeout(() => {
      router.push("/app");
      router.refresh();
    }, 1500);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "var(--sp-5)" }}>
      <Mascot size={56} />
      <div style={{ width: "100%", maxWidth: 420, marginTop: "var(--sp-6)" }}>
        <h1 style={{ fontSize: "var(--fs-30)", textAlign: "center" }}>ตั้งรหัสผ่านใหม่</h1>

        {error && (
          <p style={{ marginTop: "var(--sp-5)", fontSize: "var(--fs-14)", color: "var(--status-danger-fg)", background: "var(--status-danger-bg)", padding: "10px 14px", borderRadius: "var(--r-md)" }}>
            {error}
          </p>
        )}
        {done && (
          <p style={{ marginTop: "var(--sp-5)", fontSize: "var(--fs-14)", color: "var(--status-success-fg)", background: "var(--status-success-bg)", padding: "10px 14px", borderRadius: "var(--r-md)" }}>
            ตั้งรหัสผ่านใหม่สำเร็จ กำลังพาไปหน้าแอป...
          </p>
        )}

        {stage === "confirm" && (
          <div style={{ marginTop: "var(--sp-6)" }}>
            <p style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)", marginBottom: "var(--sp-5)" }}>กดยืนยันเพื่อดำเนินการตั้งรหัสผ่านใหม่</p>
            <Button size="lg" block icon={ShieldCheck} onClick={handleConfirmLink}>
              ยืนยันลิงก์
            </Button>
          </div>
        )}

        {stage === "verifying" && (
          <div style={{ marginTop: "var(--sp-8)", display: "grid", placeItems: "center" }}>
            <span className="kru-spin" aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 999, border: "3px solid var(--border-subtle)", borderTopColor: "var(--brand)" }} />
          </div>
        )}

        {stage === "verified" && !done && (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--sp-5)", marginTop: "var(--sp-6)" }}>
            <Input label="รหัสผ่านใหม่" type="password" icon={KeyRound} placeholder="อย่างน้อย 6 ตัวอักษร" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            <Input label="ยืนยันรหัสผ่านใหม่" type="password" icon={KeyRound} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />
            <Button size="lg" block loading={loading} type="submit">
              บันทึกรหัสผ่านใหม่
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
