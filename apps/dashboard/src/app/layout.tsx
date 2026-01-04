/**
 * Root Layout for Dashboard
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cream Trading Dashboard",
  description: "Agentic trading system dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
