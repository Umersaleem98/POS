import type { Metadata } from "next";
import "./globals.css";
import "./advanced.css";
export const metadata: Metadata = {
  title: "POS · Retail workspace",
  description: "Sales, inventory and store management in one workspace.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
