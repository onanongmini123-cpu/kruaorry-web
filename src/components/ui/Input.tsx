"use client";

import React, { useId } from "react";
import type { LucideIcon } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: LucideIcon;
  containerClassName?: string;
  trailing?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, icon: Icon, containerClassName = "", trailing, id, className = "", ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className={`kru-field ${containerClassName}`}>
      {label && (
        <label htmlFor={inputId} className="kru-field__label">
          {label}
        </label>
      )}
      <div className={`kru-field__control ${Icon ? "kru-field--has-icon" : ""}`} style={{ position: "relative" }}>
        {Icon && (
          <span className="kru-field__icon">
            <Icon size={18} strokeWidth={1.75} />
          </span>
        )}
        <input ref={ref} id={inputId} className={`kru-input ${className}`} {...rest} />
        {trailing && <div style={{ position: "absolute", right: 6 }}>{trailing}</div>}
      </div>
    </div>
  );
});
