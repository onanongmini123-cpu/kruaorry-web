import React from "react";

export function Mascot({ size = 48 }: { size?: number | string }) {
  const px = typeof size === "number" ? `${size}px` : size;
  return (
    <div style={{ width: px, height: px, borderRadius: "999px", flex: "0 0 auto", overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascot.png" alt="มาสคอตครูอรรี่" width={960} height={960} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}
