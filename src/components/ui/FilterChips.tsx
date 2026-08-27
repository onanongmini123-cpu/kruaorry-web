"use client";

import React from "react";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterChipsProps {
  label: string;
  options: FilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
}

export function FilterChips({ label, options, value, onChange }: FilterChipsProps) {
  const toggle = (optValue: string) => {
    onChange(value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]);
  };
  return (
    <div>
      <div
        style={{
          fontSize: "var(--fs-13)",
          fontWeight: "var(--fw-semibold)",
          color: "var(--text-faint)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-wide)",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => (
          <button key={opt.value} type="button" onClick={() => toggle(opt.value)} className={`kru-chip ${value.includes(opt.value) ? "kru-chip--active" : ""}`}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
