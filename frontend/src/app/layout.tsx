import type { Metadata } from "next";
import "./globals.css";
import { AttributionFooter } from "@/components/layout/AttributionFooter";

export const metadata: Metadata = {
  title: "AI Tour Guide",
  description: "Generate coherent, mobile-friendly walking tours for cities around the world.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen flex flex-col">{children}</div>
        <AttributionFooter />
      </body>
    </html>
  );
}
