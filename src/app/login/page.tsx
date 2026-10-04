"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, KeyRound, Eye, EyeOff, CheckCircle2, User } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button, Input, IconButton } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  authCompletionDestination,
  SIGNUP_DESTINATION,
  type AuthEntryMode,
} from "@/lib/authReturnPath";
import { LINE_OA_URL } from "@/lib/config";
import { validateSignupPasswordConfirmation } from "@/lib/signupConfirmation";
import {
  buildSignupConfirmationRedirect,
  canResendSignupConfirmation,
  createSignupConfirmationResendController,
  INITIAL_SIGNUP_CONFIRMATION_RESEND_STATE,
  isPlausibleEmail,
  PASSWORD_RESET_REQUEST_MESSAGE,
  resendSignupConfirmation,
  signupConfirmationFeedback,
  SIGNUP_CONFIRMATION_LINK_UNAVAILABLE_MESSAGE,
  SIGNUP_CONFIRMATION_COOLDOWN_SECONDS,
  SIGNUP_PENDING_MESSAGE,
  thaiAuthErrorMessage,
} from "@/lib/signupEmailConfirmation";

const POINTS = [
  "สื่อพร้อมสอนภาษาไทย ใช้ได้ทันที ไม่ต้องทำเอง",
  "เทมเพลต Google Sheets/Docs/Slides และฟอร์มพร้อมใช้งาน",
  "เครื่องมือในห้องเรียน จับเวลา สุ่มชื่อ จับกลุ่ม",
];

const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>กำลังโหลด...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode: AuthEntryMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const rawNext = searchParams.get("next");
  const signInDestination = authCompletionDestination("signin", rawNext);
  const authenticatedDestination = authCompletionDestination(requestedMode, rawNext);
  const hasConfirmationError = searchParams.get("error") === "confirmation";
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<AuthEntryMode>(requestedMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordConfirmationError, setPasswordConfirmationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    hasConfirmationError ? "ลิงก์ยืนยันอีเมลไม่ถูกต้องหรือหมดอายุ กรุณากรอกอีเมลแล้วส่งอีเมลยืนยันอีกครั้ง" : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmationHelpOpen, setConfirmationHelpOpen] = useState(hasConfirmationError);
  const [resendState, setResendState] = useState(INITIAL_SIGNUP_CONFIRMATION_RESEND_STATE);
  const resendController = useMemo(
    () => createSignupConfirmationResendController(setResendState),
    [],
  );
  const resendCooldown = resendState.cooldownSeconds;
  const resendingConfirmation = resendState.resending;

  const applySignupFailureTransition = (failure: unknown) => {
    const transition = resendController.applySignupFailure(failure);
    if (transition.presentation === "error") {
      setError(transition.message);
      setNotice(null);
    } else {
      setError(null);
      setNotice(transition.message);
    }
    setMode(transition.mode);
    setConfirmationHelpOpen(transition.openConfirmationHelp);
    if (transition.clearPasswords) {
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(authenticatedDestination);
    }).catch(() => {
      // A temporary auth/network failure must not prevent manual sign-in.
    });
  }, [supabase, router, authenticatedDestination]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      resendController.elapseSecond();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendController, resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPasswordConfirmationError(null);
    if (mode === "signup") {
      const confirmationError = validateSignupPasswordConfirmation(password, confirmPassword);
      if (confirmationError) {
        setPasswordConfirmationError(confirmationError);
        return;
      }
    }
    if (!isSupabaseConfigured) {
      setError("ระบบสมาชิกยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }
    setLoading(true);

    try {
      if (mode === "signup") {
        const emailRedirectTo = buildSignupConfirmationRedirect(window.location.origin);
        if (!emailRedirectTo) {
          setError(SIGNUP_CONFIRMATION_LINK_UNAVAILABLE_MESSAGE);
          return;
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo,
          },
        });
        if (signUpError) {
          // Some provider failures can happen after an unconfirmed account was
          // created. Never expose that provider detail; offer the same recovery
          // path whether the account exists or not.
          applySignupFailureTransition(signUpError);
          return;
        }
        if (!data.session) {
          setNotice(SIGNUP_PENDING_MESSAGE);
          setMode("signin");
          setConfirmationHelpOpen(true);
          resendController.startCooldown(SIGNUP_CONFIRMATION_COOLDOWN_SECONDS);
          setPassword("");
          setConfirmPassword("");
          setShowPassword(false);
          setShowConfirmPassword(false);
          return;
        }
        router.replace(SIGNUP_DESTINATION);
        router.refresh();
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(thaiAuthErrorMessage("signin", signInError));
        // Keep every failed sign-in on the same recovery surface. Varying the
        // panel by provider error code would disclose an account's state.
        setConfirmationHelpOpen(true);
        return;
      }
      router.replace(signInDestination);
      router.refresh();
    } catch {
      if (mode === "signup") {
        // A disconnected response cannot prove whether Auth created the
        // account before delivery failed. Use the same privacy-safe recovery
        // state as a returned provider error and never ask the visitor to
        // submit the password again.
        applySignupFailureTransition(null);
      } else {
        setError("เชื่อมต่อระบบสมาชิกไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setError(null);
    setNotice(null);
    setConfirmationHelpOpen(true);
    if (!isSupabaseConfigured) {
      setError("ระบบสมาชิกยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }
    if (!isPlausibleEmail(email)) {
      setError("กรอกอีเมลให้ถูกต้องก่อนส่งอีเมลยืนยัน");
      return;
    }
    const result = await resendController.requestResend(
      () => resendSignupConfirmation(
        (credentials) => supabase.auth.resend(credentials),
        email,
        window.location.origin,
      ),
    );

    if (result.outcome === "blocked") return;

    const feedback = signupConfirmationFeedback(result);
    if (feedback.presentation === "error") setError(feedback.message);
    else setNotice(feedback.message);
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    if (!isSupabaseConfigured) {
      setError("ระบบสมาชิกยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }
    if (!isPlausibleEmail(email)) {
      setError("กรอกอีเมลให้ถูกต้องก่อนกดลืมรหัสผ่าน");
      return;
    }
    setResetting(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setNotice(PASSWORD_RESET_REQUEST_MESSAGE);
    } catch {
      // Network/provider outcomes use the same accepted copy so this flow
      // cannot be used to enumerate accounts or SMTP delivery state.
      setNotice(PASSWORD_RESET_REQUEST_MESSAGE);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr" }} className="kru-login-grid">
      <div className="kru-login-brand" style={{ background: "var(--wash-hero)", padding: "var(--sp-9)", display: "none", flexDirection: "column", justifyContent: "center" }}>
        <BrandLogo href="/" mascotSize={104} layout="stacked" className="kru-login-brand-logo" />
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
          <BrandLogo href="/" mascotSize={64} className="kru-login-form-brand" />
          <h2 style={{ fontSize: "var(--fs-30)" }}>{mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิกครู"}</h2>
          <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>
            {mode === "signin" ? "ยังไม่มีบัญชี? " : "มีบัญชีอยู่แล้ว? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
                setPassword("");
                setConfirmPassword("");
                setShowPassword(false);
                setShowConfirmPassword(false);
                setPasswordConfirmationError(null);
                setConfirmationHelpOpen(false);
              }}
              style={{ color: "var(--purple-600)", fontWeight: "var(--fw-semibold)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {mode === "signin" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
            </button>
          </p>

          {notice && (
            <p role="status" aria-live="polite" style={{ fontSize: "var(--fs-14)", color: "var(--status-success-fg)", background: "var(--status-success-bg)", padding: "10px 14px", borderRadius: "var(--r-md)", marginBottom: "var(--sp-5)" }}>
              {notice}
            </p>
          )}
          {!isSupabaseConfigured && (
            <p role="status" style={{ fontSize: "var(--fs-14)", color: "var(--status-warning-fg)", background: "var(--status-warning-bg)", padding: "10px 14px", borderRadius: "var(--r-md)", marginBottom: "var(--sp-5)" }}>
              ระบบสมาชิกยังไม่พร้อมใช้งาน กรุณากลับมาใหม่ภายหลัง
            </p>
          )}
          {error && (
            <p role="alert" style={{ fontSize: "var(--fs-14)", color: "var(--status-danger-fg)", background: "var(--status-danger-bg)", padding: "10px 14px", borderRadius: "var(--r-md)", marginBottom: "var(--sp-5)" }}>
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--sp-5)" }}>
            {mode === "signup" && (
              <Input label="ชื่อ-นามสกุล" icon={User} placeholder="ครูนภา ใจดี" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
            )}
            <Input label="อีเมล" type="email" icon={Mail} placeholder="napha@school.ac.th" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            <Input
              label="รหัสผ่าน"
              type={showPassword ? "text" : "password"}
              icon={KeyRound}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordConfirmationError) setPasswordConfirmationError(null);
              }}
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              trailing={<IconButton icon={showPassword ? EyeOff : Eye} label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} onClick={() => setShowPassword((v) => !v)} />}
            />
            {mode === "signup" && (
              <div>
                <Input
                  label="ยืนยันรหัสผ่าน"
                  type={showConfirmPassword ? "text" : "password"}
                  icon={KeyRound}
                  placeholder="กรอกรหัสผ่านเดิมอีกครั้ง"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (passwordConfirmationError) setPasswordConfirmationError(null);
                  }}
                  minLength={6}
                  autoComplete="new-password"
                  required
                  aria-invalid={passwordConfirmationError ? true : undefined}
                  aria-describedby={passwordConfirmationError ? "signup-password-confirmation-error" : undefined}
                  trailing={(
                    <IconButton
                      icon={showConfirmPassword ? EyeOff : Eye}
                      label={showConfirmPassword ? "ซ่อนรหัสผ่านในช่องยืนยัน" : "แสดงรหัสผ่านในช่องยืนยัน"}
                      onClick={() => setShowConfirmPassword((v) => !v)}
                    />
                  )}
                />
                {passwordConfirmationError && (
                  <p id="signup-password-confirmation-error" role="alert" style={{ marginTop: "var(--sp-2)", fontSize: "var(--fs-13)", color: "var(--status-danger-fg)" }}>
                    {passwordConfirmationError}
                  </p>
                )}
              </div>
            )}
            {mode === "signin" && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmationHelpOpen(true);
                    setError(null);
                    setNotice(null);
                  }}
                  style={{ color: "var(--purple-600)", fontSize: "var(--fs-14)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  ยังไม่ได้ยืนยันอีเมล?
                </button>
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
            <Button size="lg" block loading={loading} disabled={!isSupabaseConfigured} type="submit">
              {mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
            </Button>
          </form>

          {confirmationHelpOpen && (
            <div style={{ marginTop: "var(--sp-5)", padding: "var(--sp-4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-md)", background: "var(--surface-brand-wash)" }}>
              <p style={{ fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)" }}>ยังไม่ได้รับอีเมลยืนยัน?</p>
              <p style={{ margin: "var(--sp-2) 0 var(--sp-4)", fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
                กรอกอีเมลด้านบน แล้วลองส่งใหม่ได้โดยไม่ต้องสมัครซ้ำ
              </p>
              <Button
                type="button"
                variant="soft"
                size="sm"
                block
                loading={resendingConfirmation}
                disabled={!isSupabaseConfigured || !canResendSignupConfirmation(resendCooldown, resendingConfirmation)}
                onClick={handleResendConfirmation}
              >
                {resendCooldown > 0 ? `ส่งใหม่ได้ใน ${resendCooldown} วินาที` : "ส่งอีเมลยืนยันอีกครั้ง"}
              </Button>
              <p style={{ marginTop: "var(--sp-3)", fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
                หากยังไม่ได้รับอีเมล กรุณาติดต่อทีมงานทาง{" "}
                <a href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" style={{ color: "var(--purple-600)", fontWeight: "var(--fw-semibold)" }}>
                  LINE Official Account
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .kru-login-form-brand { margin: 0 auto var(--sp-7); }
        .kru-login-brand-logo .kru-brand-logo__copy strong { font-size: var(--fs-30); }
        @media (min-width: 900px) {
          .kru-login-grid { grid-template-columns: 1fr 1fr !important; }
          .kru-login-brand { display: flex !important; }
          .kru-login-form-brand { display: none; }
        }
      `}</style>
    </div>
  );
}
