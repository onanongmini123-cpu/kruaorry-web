import Link from "next/link";
import { Mascot } from "@/components/Mascot";

interface BrandLogoProps {
  href?: string;
  mascotSize?: number | string;
  layout?: "row" | "stacked";
  className?: string;
  subtitle?: string;
  ariaLabel?: string;
}

export function BrandLogo({
  href = "/",
  mascotSize = 72,
  layout = "row",
  className = "",
  subtitle,
  ariaLabel = "กลับหน้าแรก KruAorry",
}: BrandLogoProps) {
  return (
    <Link
      href={href}
      className={`kru-brand-logo kru-brand-logo--${layout}${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
    >
      <Mascot size={mascotSize} decorative />
      <span className="kru-brand-logo__copy" aria-hidden="true">
        <strong>KruAorry</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </Link>
  );
}
