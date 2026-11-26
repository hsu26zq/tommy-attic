import EntryList from "@/components/EntryList";
import { listPublic } from "@/lib/publicData";

export const revalidate = 60;
export const metadata = { title: "Notes" };

export default async function Notes() {
  const notes = await listPublic();
  return (
    <div className="page">
      <h1 className="page-heading">Notes</h1>
      <p className="muted">Notes I&apos;ve made public.</p>
      <EntryList items={notes} empty="No public notes yet." />
    </div>
  );
}
