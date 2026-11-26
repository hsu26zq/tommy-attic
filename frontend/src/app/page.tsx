import Link from "next/link";
import EntryList from "@/components/EntryList";
import { listPublic } from "@/lib/publicData";

export const revalidate = 60;

export default async function Home() {
  const latest = await listPublic(undefined, 6);
  return (
    <div className="container">
      <section className="hero">
        <h1>Welcome to the attic.</h1>
        <p>I&apos;m Tommy. This is where I keep my notes, write things down, and share what I&apos;m learning.</p>
        <div className="row" style={{ marginTop: 20 }}>
          <Link href="/blog" className="btn">Read the blog</Link>
          <Link href="/notes" className="btn secondary">Browse notes</Link>
        </div>
      </section>
      <h2>Latest</h2>
      <EntryList items={latest} empty="Nothing here yet. Check back soon." />
    </div>
  );
}
