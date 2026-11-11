import type { Metadata } from "next";
// import { Inter } from 'next/font/google';
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToasterProvider } from "@/components/toaster-provider";

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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ToasterProvider />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
