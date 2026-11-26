"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, type NoteSummary } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import { notesChanged, onNotesChanged } from "@/lib/notesEvents";

export default function EditLayout({ children }: { children: React.ReactNode }) {
  const { session, ready } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  const load = useCallback(async () => {
    const t = setTimeout(() => setSlow(true), 3000);
    try {
      setNotes(await api<NoteSummary[]>("/notes"));
      setError("");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setError(status === 403 ? "This account isn't the owner." : (e as Error).message);
    } finally {
      clearTimeout(t);
      setSlow(false);
    }
  }, []);

  useEffect(() => {
    if (session) load();
    return onNotesChanged(load);
  }, [session, load]);

  async function create(type: "note" | "post") {
    const note = await api<NoteSummary>("/notes", { method: "POST", body: JSON.stringify({ type }) });
    notesChanged();
    router.push(`/edit/${note.id}`);
  }

  if (!ready || !session) return <div className="container"><p className="muted">Loading…</p></div>;

  const posts = notes?.filter((n) => n.type === "post") ?? [];
  const plain = notes?.filter((n) => n.type === "note") ?? [];
  const item = (n: NoteSummary) => (
    <li key={n.id}>
      <Link href={`/edit/${n.id}`} className={path === `/edit/${n.id}` ? "active" : ""}>
        <span className="title">{n.title || "Untitled"}</span>
        <span className={`badge ${n.is_public ? "public" : ""}`}>{n.is_public ? "Public" : "Private"}</span>
      </Link>
    </li>
  );

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="btn small" onClick={() => create("note")}>+ Note</button>
          <button className="btn small secondary" onClick={() => create("post")}>+ Post</button>
        </div>
        {slow && <p className="muted small">Waking up the server (up to a minute on the free plan)…</p>}
        {error && <div className="notice small">{error}</div>}
        {notes && (
          <>
            <div className="side-section">Notes</div>
            <ul className="side-list">{plain.length ? plain.map(item) : <li className="muted small" style={{ padding: "4px 10px" }}>None yet</li>}</ul>
            <div className="side-section">Blog posts</div>
            <ul className="side-list">{posts.length ? posts.map(item) : <li className="muted small" style={{ padding: "4px 10px" }}>None yet</li>}</ul>
          </>
        )}
        <div className="side-footer">
          <Link href="/edit/settings">Settings &amp; devices</Link>
          <button onClick={() => supabase().auth.signOut({ scope: "local" }).then(() => router.replace("/"))}>Log out</button>
        </div>
      </aside>
      <section>{children}</section>
    </div>
  );
}
