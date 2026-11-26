import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: { default: "Tommy's Attic", template: "%s · Tommy's Attic" },
  description: "Tommy's personal website: blog, notes and things worth keeping.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <footer className="site-footer">
          <p>© {new Date().getFullYear()} Tommy · Tommy&apos;s Attic</p>
          <p>
            Built with Next.js &amp; BlockNote · Hosted on Vercel &amp; Render · Data by Supabase ·{" "}
            <a href="https://github.com/hsu26zq/tommy-attic">Source on GitHub</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
