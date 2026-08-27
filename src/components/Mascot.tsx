import React from "react";

export function Mascot({ size = 48 }: { size?: number | string }) {
  const px = typeof size === "number" ? `${size}px` : size;
  return (
    <div style={{ width: px, height: px, borderRadius: "999px", flex: "0 0 auto", overflow: "hidden" }} title="มาสคอตครูอรรี่">
      <svg viewBox="0 0 120 120" width="100%" height="100%" role="img" aria-label="มาสคอตครูอรรี่">
        <circle cx="60" cy="60" r="58" fill="#F4A0C2" />
        <circle cx="60" cy="60" r="54" fill="#F8B4CF" />
        <path d="M32 40 C22 55, 20 75, 26 96 C28 103, 36 104, 38 96 C40 88, 38 72, 44 60 Z" fill="#453938" />
        <path d="M88 40 C98 55, 100 75, 94 96 C92 103, 84 104, 82 96 C80 88, 82 72, 76 60 Z" fill="#453938" />
        <ellipse cx="60" cy="46" rx="36" ry="32" fill="#453938" />
        <path d="M36 48 C36 72, 46 84, 60 84 C74 84, 84 72, 84 48 C84 34, 74 30, 60 30 C46 30, 36 34, 36 48 Z" fill="#FFF0F5" />
        <ellipse cx="43" cy="64" rx="7" ry="4.5" fill="#F472B6" fillOpacity="0.65" />
        <ellipse cx="77" cy="64" rx="7" ry="4.5" fill="#F472B6" fillOpacity="0.65" />
        <path d="M44 46 C48 43, 53 45, 55 47" stroke="#3A302F" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M76 46 C72 43, 67 45, 65 47" stroke="#3A302F" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="48" cy="54" rx="4" ry="5.5" fill="#1E1B1B" />
        <circle cx="46.5" cy="52" r="1.6" fill="#FFFFFF" />
        <circle cx="49.5" cy="55.5" r="0.8" fill="#FFFFFF" />
        <ellipse cx="72" cy="54" rx="4" ry="5.5" fill="#1E1B1B" />
        <circle cx="70.5" cy="52" r="1.6" fill="#FFFFFF" />
        <circle cx="73.5" cy="55.5" r="0.8" fill="#FFFFFF" />
        <circle cx="60" cy="60" r="1.2" fill="#E89BA7" />
        <path d="M53 68 Q60 77 67 68" stroke="#BE185D" strokeWidth="2.4" strokeLinecap="round" fill="#E11D48" />
        <path d="M56 68 Q60 72 64 68" fill="#FFFFFF" />
        <path d="M34 46 C38 32, 50 26, 60 38 C70 26, 82 32, 86 46 C84 38, 74 32, 60 32 C46 32, 36 38, 34 46 Z" fill="#3A302F" />
      </svg>
    </div>
  );
}
