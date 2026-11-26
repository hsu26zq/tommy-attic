import type { Metadata } from "next";
import "@mantine/core/styles.css";
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
