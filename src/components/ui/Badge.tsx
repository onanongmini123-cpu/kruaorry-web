import React from "react";
import type { LucideIcon } from "lucide-react";

type Tone = "info" | "success" | "warning" | "danger" | "member" | "brand" | "neutral";

interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
}

export function Badge({ tone = "neutral", icon: Icon, children }: BadgeProps) {
  return (
    <span className={`kru-badge kru-badge--${tone}`}>
      {Icon && <Icon size={13} strokeWidth={2} />}
      {children}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="kru-tag">{children}</span>;
}
