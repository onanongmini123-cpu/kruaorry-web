"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: number;
}

export function IconButton({ icon: Icon, label, size = 20, className = "", ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} className={`kru-iconbtn ${className}`} {...rest}>
      <Icon size={size} strokeWidth={1.75} />
    </button>
  );
}
