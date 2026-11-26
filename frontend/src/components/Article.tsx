import { notFound } from "next/navigation";
import { ViewerClient } from "./ClientOnly";
import { formatDate, getPublic } from "@/lib/publicData";

export default async function Article({ slug }: { slug: string }) {
  const note = await getPublic(slug);
  if (!note) notFound();
  return (
    <article className="page article">
      <header className="article-head">
        <div className="entry-meta">{formatDate(note.published_at ?? note.updated_at)}</div>
        <h1>{note.title}</h1>
      </header>
      <ViewerClient content={note.content} />
    </article>
  );
}
