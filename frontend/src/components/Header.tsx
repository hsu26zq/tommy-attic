"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/useSession";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/notes", label: "Notes" },
  { href: "/about", label: "About" },
];

export default function Header() {
  const path = usePathname();
  const { session } = useSession();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        Tommy&apos;s Attic
      </Link>
      <nav>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "active" : ""}>
            {n.label}
          </Link>
        ))}
        {session && (
          <Link href="/edit" className={`edit-link ${active("/edit") ? "active" : ""}`}>
            Edit
          </Link>
        )}
      </nav>
    </header>
  );
}
