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

const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  block,
  loading,
  disabled,
  onClick,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const sizeClass = size === "lg" ? "kru-btn--lg" : size === "sm" ? "kru-btn--sm" : "";
  // A busy button stays focusable (aria-disabled) instead of `disabled`: a focused
  // button that becomes disabled drops keyboard focus to the page, so the person
  // would have to tab from the top again. Clicks (and the form submission a click
  // on a submit button would start) are ignored until it is no longer busy.
  const busy = Boolean(loading) && !disabled;
  const handleClick = busy
    ? (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault()
    : onClick;
  return (
    <button
      className={`kru-btn kru-btn--${variant} ${sizeClass} ${block ? "kru-btn--block" : ""} ${className}`}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <>
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
          {/* Keep the accessible name while only the spinner is shown. */}
          {children && <span style={VISUALLY_HIDDEN}>{children}</span>}
        </>
      ) : (
        <>
          {Icon && <Icon size={size === "sm" ? 16 : 18} strokeWidth={1.75} />}
          {children && <span>{children}</span>}
        </>
      )}
    </button>
  );
}
