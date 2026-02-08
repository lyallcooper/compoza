import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout";
import { titleTemplate } from "./metadata";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Compoza",
    template: titleTemplate,
  },
  description: "A TUI-inspired web application for managing Docker Compose projects",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">
              <div className="max-w-[1200px] mx-auto px-4 py-6">
                {children}
              </div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
