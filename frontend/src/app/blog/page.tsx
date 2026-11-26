import EntryList from "@/components/EntryList";
import { listPublic } from "@/lib/publicData";

export const revalidate = 60;
export const metadata = { title: "Blog" };

export default async function Blog() {
  const posts = await listPublic("post");
  return (
    <div className="container">
      <h1 className="page-title">Blog</h1>
      <p className="muted">Things I&apos;ve written.</p>
      <EntryList items={posts} empty="No posts yet." />
    </div>
  );
}
