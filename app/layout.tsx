import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "TELEJKA — на одной волне",
  description: "Место для твоих мыслей, своих людей и разговоров обо всём.",
  icons: { icon: "/telejka-logo.png" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
