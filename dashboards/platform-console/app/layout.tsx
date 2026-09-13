import type { Metadata } from "next";
// import { Inter } from 'next/font/google';
import "./globals.css";

// const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ZayOS - Platform Console",
  description: "Secure operations and administration for the ZayOS platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
