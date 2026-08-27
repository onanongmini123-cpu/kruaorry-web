"use client";

import React, { useId } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  containerClassName?: string;
}

export function Select({ label, options, onChange, id, className = "", containerClassName = "", ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div className={`kru-field ${containerClassName}`}>
      {label && (
        <label htmlFor={selectId} className="kru-field__label">
          {label}
        </label>
      )}
      <select id={selectId} className={`kru-select ${className}`} onChange={(e) => onChange?.(e.target.value)} {...rest}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
