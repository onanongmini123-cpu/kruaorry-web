"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, LogOut, Trash2, UserRound } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { AvatarCropper } from "@/components/AvatarCropper";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import type { Profile } from "@/lib/data";
import { updateMyDisplayName } from "@/lib/data";
import { friendlyErrorMessage } from "@/lib/userMessages";
import {
  cropAndOptimizeAvatar,
  persistMyAvatarBlob,
  primeAvatarPreview,
  removeMyAvatar,
  validateAvatarFile,
  type AvatarCrop,
} from "@/lib/profileAvatar";

type Props = {
  supabase: SupabaseClient;
  profile: Profile;
  onUpdated: (profile: Profile) => void;
  onSignOut: () => void;
  signingOut: boolean;
  membershipSummary?: ReactNode;
};

export function ProfileSettings({ supabase, profile, onUpdated, onSignOut, signingOut, membershipSummary }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const operationRef = useRef(false);
  const [fullName, setFullName] = useState(profile.fullName ?? "");
  const [avatarPath, setAvatarPath] = useState(profile.avatarPath);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = savingName || avatarBusy;

  const chooseFile = (file: File | null) => {
    setMessage(null);
    setError(null);
    if (!file) return;
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setCropFile(file);
  };

  const saveName = async () => {
    if (operationRef.current) return;
    setError(null);
    setMessage(null);
    const normalizedName = fullName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 80) {
      setError("ชื่อที่แสดงต้องมี 2–80 ตัวอักษร");
      return;
    }
    operationRef.current = true;
    setSavingName(true);
    try {
      const updateError = await updateMyDisplayName(supabase, normalizedName);
      if (updateError) throw new Error(updateError);
      onUpdated({ ...profile, fullName: normalizedName, avatarPath });
      setMessage("บันทึกชื่อที่แสดงเรียบร้อยแล้ว");
    } catch (caught) {
      setError(friendlyErrorMessage(caught, "บันทึกชื่อที่แสดงไม่สำเร็จ"));
    } finally {
      operationRef.current = false;
      setSavingName(false);
    }
  };

  const confirmAvatar = async (crop: AvatarCrop) => {
    if (!cropFile || busy || operationRef.current) return;
    operationRef.current = true;
    setError(null);
    setMessage(null);
    setAvatarBusy(true);
    try {
      const blob = await cropAndOptimizeAvatar(cropFile, crop);
      const result = await persistMyAvatarBlob(supabase, blob, avatarPath);
      if (result.error || !result.avatarPath) throw new Error(result.error ?? "บันทึกรูปโปรไฟล์ไม่สำเร็จ");

      primeAvatarPreview(supabase, result.avatarPath, blob);
      setAvatarPath(result.avatarPath);
      setCropFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUpdated({ ...profile, avatarPath: result.avatarPath });
      setMessage("เปลี่ยนรูปโปรไฟล์เรียบร้อยแล้ว");
      if (result.cleanupWarning) setError(result.cleanupWarning);
    } catch (caught) {
      setError(friendlyErrorMessage(caught, "บันทึกรูปโปรไฟล์ไม่สำเร็จ"));
    } finally {
      operationRef.current = false;
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    if (!avatarPath || busy || operationRef.current) return;
    operationRef.current = true;
    setAvatarBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await removeMyAvatar(supabase, avatarPath);
      if (result.error) throw new Error(result.error);
      setAvatarPath(null);
      setCropFile(null);
      onUpdated({ ...profile, avatarPath: null });
      setMessage("นำรูปโปรไฟล์ออกแล้ว");
      if (result.cleanupWarning) setError(result.cleanupWarning);
    } catch (caught) {
      setError(friendlyErrorMessage(caught, "นำรูปโปรไฟล์ออกไม่สำเร็จ"));
    } finally {
      operationRef.current = false;
      setAvatarBusy(false);
    }
  };

  return (
    <section className="kru-profile-settings" aria-labelledby="account-heading">
      <div className="kru-profile-settings__heading">
        <UserRound size={24} aria-hidden="true" />
        <div>
          <h1 id="account-heading">บัญชีของฉัน</h1>
          <p>แก้ไขชื่อที่แสดงและรูปโปรไฟล์ โดยไม่เปลี่ยนสิทธิ์สมาชิก</p>
        </div>
      </div>

      {membershipSummary}

      <div className="kru-profile-settings__avatar">
        <ProfileAvatar supabase={supabase} avatarPath={avatarPath} name={fullName || profile.email} size={96} />
        <div className="kru-profile-settings__avatar-actions">
          <Button
            type="button"
            variant="soft"
            icon={Camera}
            onClick={() => inputRef.current?.click()}
            disabled={busy || signingOut}
          >
            {avatarPath ? "เปลี่ยนรูป" : "เพิ่มรูปโปรไฟล์"}
          </Button>
          <input
            ref={inputRef}
            id="profile-avatar-input"
            aria-label="เลือกรูปโปรไฟล์"
            className="kru-visually-hidden"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={busy || signingOut}
            onChange={(event) => {
              chooseFile(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          {avatarPath && (
            <Button type="button" variant="ghost" icon={Trash2} onClick={() => void removeAvatar()} disabled={busy || signingOut}>
              นำรูปออก
            </Button>
          )}
          <small>รองรับ JPG, PNG และ WebP ไม่เกิน 5 MB ระบบจะครอป 1:1 และบีบอัดก่อนอัปโหลด</small>
        </div>
        {cropFile && (
          <div className="kru-profile-settings__cropper">
            <AvatarCropper
              key={`${cropFile.name}:${cropFile.size}:${cropFile.lastModified}`}
              file={cropFile}
              busy={avatarBusy}
              onConfirm={confirmAvatar}
              onCancel={() => {
                setCropFile(null);
                setError(null);
                setMessage("ยกเลิกการเลือกรูปแล้ว");
              }}
            />
          </div>
        )}
      </div>

      <div className="kru-profile-settings__form">
        <Input label="ชื่อที่แสดง" value={fullName} maxLength={80} onChange={(event) => setFullName(event.target.value)} />
        <Input label="อีเมล" value={profile.email} disabled />
        <Button
          type="button"
          onClick={() => void saveName()}
          loading={savingName}
          disabled={signingOut || avatarBusy || Boolean(cropFile)}
          aria-label={savingName ? "กำลังบันทึกชื่อที่แสดง" : undefined}
        >
          บันทึกชื่อที่แสดง
        </Button>
      </div>
      {error && <p role="alert" aria-live="assertive" className="kru-profile-settings__error">{error}</p>}
      {message && <p role="status" aria-live="polite" className="kru-profile-settings__success">{message}</p>}

      <div className="kru-profile-settings__logout">
        <div>
          <h2>ออกจากระบบ</h2>
          <p>ล้างเซสชันในอุปกรณ์นี้ และกลับไปยังหน้าเข้าสู่ระบบ</p>
        </div>
        <Button type="button" variant="ghost" icon={LogOut} onClick={onSignOut} loading={signingOut} disabled={busy}>
          ออกจากระบบ
        </Button>
      </div>

      <style jsx>{`
        .kru-profile-settings { max-width: 760px; display: grid; gap: var(--sp-7); }
        .kru-profile-settings__heading { display: flex; align-items: flex-start; gap: var(--sp-4); }
        .kru-profile-settings__heading h1 { font-size: var(--fs-30); }
        .kru-profile-settings__heading p { margin-top: var(--sp-2); color: var(--text-muted); }
        .kru-profile-settings__avatar, .kru-profile-settings__form, .kru-profile-settings__logout { padding: var(--sp-6); border: 1px solid var(--border-subtle); border-radius: var(--r-card); background: var(--surface-card); box-shadow: var(--shadow-xs); }
        .kru-profile-settings__avatar { display: flex; align-items: center; gap: var(--sp-6); flex-wrap: wrap; }
        .kru-profile-settings__avatar-actions { flex: 1; min-width: min(100%, 240px); display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-profile-settings__avatar-actions small { width: 100%; color: var(--text-muted); line-height: 1.5; }
        .kru-profile-settings__cropper { flex: 1 0 100%; min-width: 0; }
        .kru-profile-settings__form { display: grid; gap: var(--sp-5); }
        .kru-profile-settings__form :global(.kru-btn) { width: fit-content; }
        .kru-profile-settings__logout { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-5); border-color: var(--border-default); }
        .kru-profile-settings__logout h2 { font-size: var(--fs-18); }
        .kru-profile-settings__logout p { margin-top: var(--sp-2); color: var(--text-muted); font-size: var(--fs-14); }
        .kru-profile-settings__logout :global(.kru-btn) { flex: 0 0 auto; }
        .kru-profile-settings__error, .kru-profile-settings__success { padding: var(--sp-4); border-radius: var(--r-md); }
        .kru-profile-settings__error { background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-profile-settings__success { background: var(--status-success-bg); color: var(--status-success-fg); }
        .kru-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @media (max-width: 560px) {
          .kru-profile-settings__avatar { align-items: flex-start; }
          .kru-profile-settings__avatar-actions { display: grid; }
          .kru-profile-settings__avatar-actions :global(.kru-btn) { width: 100%; justify-content: center; }
          .kru-profile-settings__form :global(.kru-btn) { width: 100%; }
          .kru-profile-settings__logout { align-items: stretch; flex-direction: column; }
          .kru-profile-settings__logout :global(.kru-btn) { width: 100%; }
        }
      `}</style>
    </section>
  );
}
