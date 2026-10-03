"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

export interface SideNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number | null;
}

export interface SideNavGroup {
  label?: string;
  items: SideNavItem[];
}

interface SideNavProps {
  groups: SideNavGroup[];
  value: string;
  onChange: (key: string) => void;
}

export function SideNav({ groups, value, onChange }: SideNavProps) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: "var(--sp-6)" }}>
      {groups.map((group, gi) => (
        <div key={group.label || gi}>
          {group.label && (
            <div
              style={{
                fontSize: "var(--fs-12)",
                fontWeight: "var(--fw-semibold)",
                letterSpacing: "var(--ls-wide)",
                textTransform: "uppercase",
                color: "var(--text-faint)",
                padding: "0 var(--sp-4)",
                marginBottom: 4,
              }}
            >
              {group.label}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.key === value;
              const showBadge = item.badge === null || (typeof item.badge === "number" && item.badge > 0);
              const badgeLabel = item.badge === null
                ? `${item.label} ยังตรวจจำนวนรายการที่ต้องดำเนินการไม่ได้`
                : showBadge
                  ? `${item.label} มี ${item.badge?.toLocaleString("th-TH")} รายการที่ต้องดำเนินการ`
                  : undefined;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChange(item.key)}
                  className={`kru-sidenav__item ${active ? "kru-sidenav__item--active" : ""}`}
                  aria-label={badgeLabel}
                >
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                  <span>{item.label}</span>
                  {showBadge && (
                    <span className="kru-sidenav__badge" aria-hidden="true">
                      {item.badge === null ? "—" : item.badge! > 99 ? "99+" : item.badge!.toLocaleString("th-TH")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
