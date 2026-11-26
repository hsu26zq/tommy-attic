import EntryList from "@/components/EntryList";
import { listPublic } from "@/lib/publicData";

export const revalidate = 60;
export const metadata = { title: "Notes" };

export default async function Notes() {
  const notes = await listPublic("note");
  return (
    <div className="container">
      <h1 className="page-title">Notes</h1>
      <p className="muted">Notes I&apos;ve made public.</p>
      <EntryList items={notes} empty="No public notes yet." />
    </div>
  );
}
