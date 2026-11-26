import Link from "next/link";
import { excerpt, formatDate, type PublicNote } from "@/lib/publicData";

export default function EntryList({
  items,
  empty,
}: {
  items: Omit<PublicNote, "content">[];
  empty: string;
}) {
  if (!items.length) return <div className="empty">{empty}</div>;
  return (
    <ul className="entry-list">
      {items.map((n) => (
        <li key={n.id}>
          <Link href={`/${n.type === "post" ? "blog" : "notes"}/${n.slug}`}>
            <div className="entry-meta">
              {n.type === "post" ? "Post" : "Note"} · {formatDate(n.published_at ?? n.updated_at)}
            </div>
            <h3>{n.title}</h3>
            {excerpt(n.markdown) && <p>{excerpt(n.markdown)}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
