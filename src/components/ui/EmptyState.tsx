import React from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="kru-empty">
      <span className="kru-empty__icon">
        <Icon size={26} strokeWidth={1.75} />
      </span>
      <div>
        <div style={{ fontSize: "var(--fs-16)", fontWeight: "var(--fw-semibold)", color: "var(--text-strong)" }}>{title}</div>
        {description && <p style={{ marginTop: 6, fontSize: "var(--fs-14)", color: "var(--text-muted)", maxWidth: 360 }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}
