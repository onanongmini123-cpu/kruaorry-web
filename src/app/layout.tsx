import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DEFAULT_SHARE_IMAGE, SITE_ORIGIN } from "@/lib/site";

// Fonts live in the project (src/fonts, SIL Open Font License, see src/fonts/README.md)
// so a build never has to reach Google Fonts. The files are the same woff2 files Google
// served for these families, one for the Thai letters and one for the Latin letters, tied
// to the same character ranges, so the pages look exactly as before. The stacks in
// globals.css try the Latin file first, then the Thai file. (next/font only accepts
// literal values, so the ranges are written out in each call.)
const anuphanLatin = localFont({
  src: "../fonts/anuphan-latin-variable.woff2",
  weight: "500 700",
  variable: "--font-anuphan-latin",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
const anuphanThai = localFont({
  src: "../fonts/anuphan-thai-variable.woff2",
  weight: "500 700",
  variable: "--font-anuphan-thai",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC" }],
});

const plexThaiLatin = localFont({
  src: [
    { path: "../fonts/ibm-plex-sans-thai-latin-400.woff2", weight: "400" },
    { path: "../fonts/ibm-plex-sans-thai-latin-500.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-sans-thai-latin-600.woff2", weight: "600" },
  ],
  variable: "--font-plex-thai-latin",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
const plexThaiThai = localFont({
  src: [
    { path: "../fonts/ibm-plex-sans-thai-thai-400.woff2", weight: "400" },
    { path: "../fonts/ibm-plex-sans-thai-thai-500.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-sans-thai-thai-600.woff2", weight: "600" },
  ],
  variable: "--font-plex-thai-thai",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC" }],
});

const plexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-latin-400.woff2", weight: "400" },
    { path: "../fonts/ibm-plex-mono-latin-500.woff2", weight: "500" },
  ],
  variable: "--font-plex-mono",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
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
      className={`${anuphanLatin.variable} ${anuphanThai.variable} ${plexThaiLatin.variable} ${plexThaiThai.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
