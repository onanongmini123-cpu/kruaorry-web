import type { Metadata } from "next";
import { Anuphan, IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { DEFAULT_SHARE_IMAGE, SITE_ORIGIN } from "@/lib/site";

const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
});

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const title = "KruAorry — ครูมีงานเยอะพออยู่แล้ว ให้ครูอรรี่ช่วย";
const description =
  "คลังสื่อการสอน เทมเพลต Google และเครื่องมือในห้องเรียนสำหรับครูไทย ใช้งานง่าย ดาวน์โหลดแล้วสอนได้เลย";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  // Pages give a plain title; this adds the brand once.
  title: { default: title, template: "%s | KruAorry" },
  description,
  openGraph: {
    title,
    description,
    type: "website",
    locale: "th_TH",
    siteName: "KruAorry",
    images: [DEFAULT_SHARE_IMAGE],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: [DEFAULT_SHARE_IMAGE.url],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${anuphan.variable} ${plexThai.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
