"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, Trash2, UserRound } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import type { Profile } from "@/lib/data";
import { updateMyProfile } from "@/lib/data";
import {
  avatarStoragePath,
  clearAvatarSignedUrlCache,
  cropAndOptimizeAvatar,
  PROFILE_AVATAR_BUCKET,
  validateAvatarFile,
} from "@/lib/profileAvatar";

type Props = {
  supabase: SupabaseClient;
  profile: Profile;
  onUpdated: (profile: Profile) => void;
};

export function ProfileSettings({ supabase, profile, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(profile.fullName ?? "");
  const [avatarPath, setAvatarPath] = useState(profile.avatarPath);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const removeStoredAvatar = async (path: string): Promise<string | null> => {
    try {
      const { error: removeError } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
      return removeError?.message ?? null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : "ลบไฟล์รูปโปรไฟล์ไม่สำเร็จ";
    } finally {
      clearAvatarSignedUrlCache(supabase, path);
    }
  };

  const chooseFile = (file: File | null) => {
    setMessage(null);
    setError(null);
    if (!file) return setSelectedFile(null);
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setSelectedFile(null);
      setError(validationError);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
  };

  const save = async () => {
    setError(null);
    setMessage(null);
    const normalizedName = fullName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 80) {
      setError("ชื่อที่แสดงต้องมี 2–80 ตัวอักษร");
      return;
    }
    setSaving(true);
    let nextPath = avatarPath;
    let uploadedPath: string | null = null;
    let profileUpdated = false;
    try {
      if (selectedFile) {
        const blob = await cropAndOptimizeAvatar(selectedFile);
        uploadedPath = avatarStoragePath();
        const { error: uploadError } = await supabase.storage
          .from(PROFILE_AVATAR_BUCKET)
          .upload(uploadedPath, blob, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
        if (uploadError) throw new Error(uploadError.message);
        nextPath = uploadedPath;
      }

      const updateError = await updateMyProfile(supabase, normalizedName, nextPath);
      if (updateError) throw new Error(updateError);
      profileUpdated = true;

      const previousPath = avatarPath;
      setAvatarPath(nextPath);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUpdated({ ...profile, fullName: normalizedName, avatarPath: nextPath });
      setMessage("บันทึกบัญชีเรียบร้อยแล้ว");
      if (previousPath && uploadedPath && previousPath !== uploadedPath) {
        const cleanupError = await removeStoredAvatar(previousPath);
        if (cleanupError) {
          setError("บันทึกรูปใหม่แล้ว แต่ลบไฟล์รูปเดิมไม่สำเร็จ โปรดแจ้งผู้ดูแลระบบ");
        }
      }
    } catch (caught) {
      let errorMessage = caught instanceof Error ? caught.message : "บันทึกบัญชีไม่สำเร็จ";
      if (uploadedPath && !profileUpdated) {
        const cleanupError = await removeStoredAvatar(uploadedPath);
        if (cleanupError) errorMessage += " และล้างไฟล์ที่อัปโหลดไม่สำเร็จ";
      }
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const removeAvatar = async () => {
    if (!avatarPath || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updateError = await updateMyProfile(supabase, fullName.trim(), null);
      if (updateError) throw new Error(updateError);
      const previousPath = avatarPath;
      setAvatarPath(null);
      onUpdated({ ...profile, fullName: fullName.trim(), avatarPath: null });
      setMessage("นำรูปโปรไฟล์ออกแล้ว");
      const cleanupError = await removeStoredAvatar(previousPath);
      if (cleanupError) {
        setError("นำรูปออกจากบัญชีแล้ว แต่ลบไฟล์เดิมไม่สำเร็จ โปรดแจ้งผู้ดูแลระบบ");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "นำรูปโปรไฟล์ออกไม่สำเร็จ");
    } finally {
      setSaving(false);
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

      <div className="kru-profile-settings__avatar">
        <ProfileAvatar supabase={supabase} avatarPath={avatarPath} name={fullName || profile.email} size={96} />
        <div className="kru-profile-settings__avatar-actions">
          <label className="kru-btn kru-btn--soft" htmlFor="profile-avatar-input">
            <Camera size={18} aria-hidden="true" /> เลือกรูปใหม่
          </label>
          <input
            ref={inputRef}
            id="profile-avatar-input"
            className="kru-visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          {avatarPath && (
            <Button type="button" variant="ghost" icon={Trash2} onClick={() => void removeAvatar()} disabled={saving}>
              นำรูปออก
            </Button>
          )}
          <small>{selectedFile ? `เลือกแล้ว: ${selectedFile.name}` : "ระบบจะครอปกึ่งกลางเป็นสี่เหลี่ยมและปรับขนาดอัตโนมัติ"}</small>
        </div>
      </div>

      <div className="kru-profile-settings__form">
        <Input label="ชื่อที่แสดง" value={fullName} maxLength={80} onChange={(event) => setFullName(event.target.value)} />
        <Input label="อีเมล" value={profile.email} disabled />
        <Button type="button" onClick={() => void save()} loading={saving}>บันทึกการเปลี่ยนแปลง</Button>
      </div>
      {error && <p role="alert" className="kru-profile-settings__error">{error}</p>}
      {message && <p role="status" className="kru-profile-settings__success">{message}</p>}

      <style jsx>{`
        .kru-profile-settings { max-width: 760px; display: grid; gap: var(--sp-7); }
        .kru-profile-settings__heading { display: flex; align-items: flex-start; gap: var(--sp-4); }
        .kru-profile-settings__heading h1 { font-size: var(--fs-30); }
        .kru-profile-settings__heading p { margin-top: var(--sp-2); color: var(--text-muted); }
        .kru-profile-settings__avatar, .kru-profile-settings__form { padding: var(--sp-6); border: 1px solid var(--border-subtle); border-radius: var(--r-card); background: var(--surface-card); box-shadow: var(--shadow-xs); }
        .kru-profile-settings__avatar { display: flex; align-items: center; gap: var(--sp-6); flex-wrap: wrap; }
        .kru-profile-settings__avatar-actions { flex: 1; min-width: min(100%, 240px); display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-profile-settings__avatar-actions small { width: 100%; color: var(--text-muted); line-height: 1.5; }
        .kru-profile-settings__form { display: grid; gap: var(--sp-5); }
        .kru-profile-settings__form :global(.kru-btn) { width: fit-content; }
        .kru-profile-settings__error, .kru-profile-settings__success { padding: var(--sp-4); border-radius: var(--r-md); }
        .kru-profile-settings__error { background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-profile-settings__success { background: var(--status-success-bg); color: var(--status-success-fg); }
        .kru-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @media (max-width: 560px) {
          .kru-profile-settings__avatar { align-items: flex-start; }
          .kru-profile-settings__avatar-actions { display: grid; }
          .kru-profile-settings__avatar-actions :global(.kru-btn), .kru-profile-settings__avatar-actions > label { width: 100%; justify-content: center; }
          .kru-profile-settings__form :global(.kru-btn) { width: 100%; }
        }
      `}</style>
    </section>
  );
}
