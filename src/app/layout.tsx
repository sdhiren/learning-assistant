import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { THEME_INIT_SCRIPT } from "@/components/theme/theme";
import { ThemeToggle } from "@/components/theme/theme-toggle";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "learning-assistant", template: "%s · learning-assistant" },
  description: "Claude-powered practice for technical interviews.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets data-theme before paint, so React must accept it.
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-on-accent focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-border/70 bg-canvas/75 backdrop-blur-lg">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5 font-semibold tracking-tight">
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-lg bg-brand font-mono text-sm text-white shadow-lift transition-transform group-hover:-rotate-6"
              >
                {"{}"}
              </span>
              learning-assistant
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs text-muted sm:px-6">
          Runs locally with your Claude subscription. Your progress stays on this machine.
        </footer>
      </body>
    </html>
  );
}
