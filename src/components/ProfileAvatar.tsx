"use client";

/* The source is a short-lived signed URL for a private, already resized WebP
 * object on a dynamic Supabase host. A plain lazy image avoids proxying the
 * signed query string through Next's optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, type CSSProperties } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  avatarSignedUrl,
  avatarUrlRefreshDelay,
  cachedAvatarUrl,
  subscribeAvatarCache,
} from "@/lib/profileAvatar";

type Props = {
  supabase: SupabaseClient;
  avatarPath: string | null;
  name: string;
  size?: number;
  style?: CSSProperties;
};

export function ProfileAvatar({ supabase, avatarPath, name, size = 40, style }: Props) {
  const [signedAvatar, setSignedAvatar] = useState<{ path: string; url: string } | null>(null);
  const [cacheRevision, setCacheRevision] = useState(0);
  const url = avatarPath
    ? cachedAvatarUrl(supabase, avatarPath) ?? (signedAvatar?.path === avatarPath ? signedAvatar.url : null)
    : null;
  const initials = (name.trim() || "ค").slice(0, 2).toLocaleUpperCase("th");

  useEffect(() => {
    if (!avatarPath) return;
    return subscribeAvatarCache(supabase, avatarPath, () => {
      setCacheRevision((current) => current + 1);
    });
  }, [avatarPath, supabase]);

  useEffect(() => {
    if (!avatarPath) return;

    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const nextUrl = await avatarSignedUrl(supabase, avatarPath);
        if (active) setSignedAvatar(nextUrl ? { path: avatarPath, url: nextUrl } : null);
      } catch {
        if (active) setSignedAvatar(null);
      }
      if (active) refreshTimer = setTimeout(refresh, avatarUrlRefreshDelay(supabase, avatarPath));
    };

    void refresh();
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [avatarPath, cacheRevision, supabase]);

  return (
    <span
      className="kru-profile-avatar"
      aria-label={url ? `รูปโปรไฟล์ของ ${name}` : `อักษรย่อของ ${name}`}
      style={{ width: size, height: size, ...style }}
    >
      {url ? <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : initials}
      <style jsx>{`
        .kru-profile-avatar {
          flex: 0 0 auto;
          overflow: hidden;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: linear-gradient(135deg, var(--pink-100), var(--purple-100));
          color: var(--purple-800);
          font-weight: var(--fw-bold);
          font-size: ${Math.max(12, Math.round(size * 0.34))}px;
          line-height: 1;
        }
        img { width: 100%; height: 100%; object-fit: cover; }
      `}</style>
    </span>
  );
}
