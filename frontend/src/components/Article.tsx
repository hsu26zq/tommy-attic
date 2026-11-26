import { notFound } from "next/navigation";
import { ViewerClient } from "./ClientOnly";
import { formatDate, getPublic } from "@/lib/publicData";

export default async function Article({ type, slug }: { type: "note" | "post"; slug: string }) {
  const note = await getPublic(type, slug);
  if (!note) notFound();
  return (
    <article className="container article">
      <header className="article-head">
        <div className="entry-meta">
          {type === "post" ? "Post" : "Note"} · {formatDate(note.published_at ?? note.updated_at)}
        </div>
        <h1>{note.title}</h1>
      </header>
      <ViewerClient content={note.content} />
    </article>
  );
}
