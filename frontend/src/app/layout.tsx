import type { Metadata } from "next";
import "@mantine/core/styles.css";
// Titles and headings: one formal serif for English, Chinese and Japanese, served from this site.
// Each font is cut into small pieces; a browser only downloads the pieces for characters on screen, then caches them.
import "@fontsource/noto-serif/600.css";
import "@fontsource/noto-serif-tc/600.css";
import "@fontsource/noto-serif-jp/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Notes", template: "%s" },
  description: "Notes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
