import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Plex pairs a humanist Latin with a quiet Hangul: calm enough for all-day use,
// and the mono face gives progress numerals a ledger-like steadiness.
const plexKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "차곡 · 할 일 관리",
    template: "%s · 차곡",
  },
  description: "일일 할 일, 주간 계획, 1년 목표를 하나로 잇는 할 일 관리",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${plexKr.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="isolate flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
