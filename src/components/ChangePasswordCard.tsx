"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Button, IconButton, Input } from "@/components/ui";
import { changeMemberPassword } from "@/lib/accountPassword";
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_HINT } from "@/lib/passwordPolicy";

type Props = {
  supabase: SupabaseClient;
  email: string;
  disabled?: boolean;
};

export function ChangePasswordCard({ supabase, email, disabled = false }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const clearFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || disabled) return;

    clearFeedback();
    setSaving(true);
    const result = await changeMemberPassword(supabase.auth, email, {
      currentPassword,
      newPassword,
      confirmPassword,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setMessage("เปลี่ยนรหัสผ่านแล้ว");
    setError(result.warning);
  };

  const describedBy = error ? "change-password-error" : undefined;

  return (
    <section className="kru-change-password" aria-labelledby="change-password-heading">
      <div>
        <h2 id="change-password-heading">เปลี่ยนรหัสผ่าน</h2>
        <p>ตรวจรหัสผ่านปัจจุบันก่อน และคงการเข้าระบบในอุปกรณ์นี้ไว้</p>
      </div>

      <form onSubmit={handleSubmit} className="kru-change-password__form">
        <Input
          label="รหัสผ่านปัจจุบัน"
          type={showCurrentPassword ? "text" : "password"}
          icon={KeyRound}
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            clearFeedback();
          }}
          autoComplete="current-password"
          required
          disabled={saving || disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          trailing={(
            <IconButton
              icon={showCurrentPassword ? EyeOff : Eye}
              label={showCurrentPassword ? "ซ่อนรหัสผ่านปัจจุบัน" : "แสดงรหัสผ่านปัจจุบัน"}
              onClick={() => setShowCurrentPassword((visible) => !visible)}
              disabled={saving || disabled}
            />
          )}
        />
        <Input
          label="รหัสผ่านใหม่"
          type={showNewPassword ? "text" : "password"}
          icon={KeyRound}
          placeholder={PASSWORD_MIN_LENGTH_HINT}
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
            clearFeedback();
          }}
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          required
          disabled={saving || disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          trailing={(
            <IconButton
              icon={showNewPassword ? EyeOff : Eye}
              label={showNewPassword ? "ซ่อนรหัสผ่านใหม่" : "แสดงรหัสผ่านใหม่"}
              onClick={() => setShowNewPassword((visible) => !visible)}
              disabled={saving || disabled}
            />
          )}
        />
        <Input
          label="ยืนยันรหัสผ่านใหม่"
          type={showConfirmPassword ? "text" : "password"}
          icon={KeyRound}
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            clearFeedback();
          }}
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          required
          disabled={saving || disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          trailing={(
            <IconButton
              icon={showConfirmPassword ? EyeOff : Eye}
              label={showConfirmPassword ? "ซ่อนรหัสผ่านในช่องยืนยัน" : "แสดงรหัสผ่านในช่องยืนยัน"}
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              disabled={saving || disabled}
            />
          )}
        />

        {error && <p id="change-password-error" role="alert" aria-live="assertive" className="kru-change-password__error">{error}</p>}
        {message && <p role="status" aria-live="polite" className="kru-change-password__success">{message}</p>}

        <Button type="submit" loading={saving} disabled={disabled}>
          เปลี่ยนรหัสผ่าน
        </Button>
      </form>

      <style jsx>{`
        .kru-change-password { padding: var(--sp-6); border: 1px solid var(--border-subtle); border-radius: var(--r-card); background: var(--surface-card); box-shadow: var(--shadow-xs); display: grid; gap: var(--sp-5); }
        .kru-change-password h2 { font-size: var(--fs-18); }
        .kru-change-password > div > p { margin-top: var(--sp-2); color: var(--text-muted); font-size: var(--fs-14); line-height: var(--lh-relaxed); }
        .kru-change-password__form { display: grid; gap: var(--sp-5); }
        .kru-change-password__form :global(.kru-btn) { width: fit-content; }
        .kru-change-password__error, .kru-change-password__success { padding: var(--sp-4); border-radius: var(--r-md); }
        .kru-change-password__error { background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-change-password__success { background: var(--status-success-bg); color: var(--status-success-fg); }
        @media (max-width: 560px) {
          .kru-change-password__form :global(.kru-btn) { width: 100%; }
        }
      `}</style>
    </section>
  );
}
