import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SecurePay Outreach Engine",
  description: "Command Centre for the SecurePay Outreach Engine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
