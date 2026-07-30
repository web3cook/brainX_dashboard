import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "brainX, the AI CMO running your entire marketing",
  description:
    "You brief the CMO in chat. It plans, spins up the right agents, and streams every step.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} h-full`}>
      <body className="bg-void text-ink min-h-full font-mono antialiased">
        {children}
      </body>
    </html>
  );
}
