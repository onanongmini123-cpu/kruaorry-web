"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

export interface SideNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
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
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChange(item.key)}
                  className={`kru-sidenav__item ${active ? "kru-sidenav__item--active" : ""}`}
                >
                  <Icon size={20} strokeWidth={1.75} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
