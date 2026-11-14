import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./brand.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The brand is CasePace (Lorenzo, 31 Oct 2026). Pages without a title of
// their own (the signed-in app) show the brand alone.
export const metadata: Metadata = {
  title: { default: "CasePace", template: "%s | CasePace" },
  description: "Mock case interviews with an AI interviewer, by voice or text, and a feedback report on the 8 skills case interviews test.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
