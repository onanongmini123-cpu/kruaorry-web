"use client";

import React from "react";

interface CheckboxProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="kru-checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

interface SwitchProps {
  label?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`kru-switch ${checked ? "kru-switch--on" : ""}`}>
      <span className="kru-switch__track" aria-hidden="true" />
      {label && <span style={{ fontSize: "var(--fs-15)", color: "var(--text-body)" }}>{label}</span>}
    </button>
  );
}
