import type { Metadata } from "next";
import { Ibarra_Real_Nova, Literata } from "next/font/google";
import "./globals.css";
import { AttributionFooter } from "@/components/layout/AttributionFooter";

const ibarraRealNova = Ibarra_Real_Nova({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AI Tour Guide",
  description: "Generate mobile-friendly audio walking tours for cities around the world.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ibarraRealNova.variable} ${literata.variable} antialiased`}
      >
        <div className="min-h-screen flex flex-col">{children}</div>
        <AttributionFooter />
      </body>
    </html>
  );
}
