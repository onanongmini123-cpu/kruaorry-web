import type { Metadata } from "next";

// Account pages are not search destinations; their content depends on who is
// signed in. They stay crawlable so the noindex tag is seen.
export const metadata: Metadata = {
  title: "สมัครสมาชิกและแพ็กเกจ",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
