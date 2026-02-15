import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TONOSAMA Owner",
  description: "Owner moderation controls"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
