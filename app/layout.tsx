import type { Metadata, Viewport } from "next";
import "./globals.css";
import {SeasonalTheme} from "@/components/seasonal-theme";
import {GlassEffects} from '@/components/glass-settings';
export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover"};
export const metadata: Metadata = {
  title: "TELEJKA",
  description: "Посты, личные сообщения и групповые чаты.",
  icons: { icon: "/telejka-logo.png", apple: "/push-icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TELEJKA", statusBarStyle: "default" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('telejka-theme');document.documentElement.dataset.theme=t==='dark'?'dark':t==='halloween'&&Date.now()<Date.parse('2026-11-01T00:00:00+03:00')?'halloween':'light';document.documentElement.dataset.season=document.documentElement.dataset.theme==='halloween'?'halloween':''}catch{document.documentElement.dataset.theme='light'}",
          }}
        />
      </head>
      <body><SeasonalTheme/><GlassEffects/>{children}</body>
    </html>
  );
}
