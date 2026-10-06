import Link from "next/link";
import { Mascot } from "@/components/Mascot";
import "./PublicTopBar.css";

interface PublicTopBarProps {
  actionHref: string;
  actionLabel: string;
}

/** Brand link plus one account/navigation link, shared by the public resource pages. */
export function PublicTopBar({ actionHref, actionLabel }: PublicTopBarProps) {
  return (
    <header className="kru-topbar">
      <div className="kru-topbar__inner">
        <Link href="/" className="kru-topbar__brand"><Mascot size={34} /> KruAorry</Link>
        <Link href={actionHref} className="kru-topbar__action">{actionLabel}</Link>
      </div>
    </header>
  );
}
