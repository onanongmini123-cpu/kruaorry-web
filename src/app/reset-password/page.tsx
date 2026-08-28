"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
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

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError("ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่จากหน้าเข้าสู่ระบบ");
          setReady(true);
          return;
        }
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่จากหน้าเข้าสู่ระบบ");
      }
      setReady(true);
    })();
  }, [supabase, searchParams]);

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

  if (!ready) {
    return <LoadingSpinner />;
  }

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

        {!done && !error && (
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
