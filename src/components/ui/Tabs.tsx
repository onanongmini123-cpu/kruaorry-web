"use client";

import React from "react";

interface TabItem {
  value: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div className="kru-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
          className={`kru-tabs__item ${item.value === value ? "kru-tabs__item--active" : ""}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
