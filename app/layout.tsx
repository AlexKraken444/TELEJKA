import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "TELEJKA",
  description: "Посты, личные сообщения и групповые чаты.",
  icons: { icon: "/telejka-logo.png" },
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
              "try{document.documentElement.dataset.theme=localStorage.getItem('telejka-theme')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
