"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "soft" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  block,
  loading,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const sizeClass = size === "lg" ? "kru-btn--lg" : size === "sm" ? "kru-btn--sm" : "";
  return (
    <button
      className={`kru-btn kru-btn--${variant} ${sizeClass} ${block ? "kru-btn--block" : ""} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            border: "2px solid currentColor",
            borderTopColor: "transparent",
          }}
          className="kru-spin"
        />
      ) : (
        <>
          {Icon && <Icon size={size === "sm" ? 16 : 18} strokeWidth={1.75} />}
          {children && <span>{children}</span>}
        </>
      )}
    </button>
  );
}
