"use client";

import React from "react";
import { Search, X } from "lucide-react";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function SearchField({ value, onChange, placeholder, className = "", style }: SearchFieldProps) {
  return (
    <div className={`kru-field__control kru-field--has-icon ${className}`} style={{ position: "relative", ...style }}>
      <span className="kru-field__icon">
        <Search size={18} strokeWidth={1.75} />
      </span>
      <input
        className="kru-input"
        style={{ minHeight: 48, paddingRight: value ? 40 : undefined }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="ล้างคำค้นหา"
          onClick={() => onChange("")}
          style={{ position: "absolute", right: 8, border: "none", background: "transparent", color: "var(--text-faint)", cursor: "pointer", padding: 8 }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
