"use client";
import { PageGlyph } from "@/components/workspace/icons";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { notesChanged } from "@/lib/notesEvents";
import { Topbar } from "@/components/workspace/Workspace";

type Item = { id: string; title: string; icon: string | null; deleted_at: string };

export default function Trash() {
  const [items, setItems] = useState<Item[] | null>(null);
  const load = useCallback(() => api<Item[]>("/notes/trash").then(setItems).catch(() => setItems([])), []);
  useEffect(() => {
    load();
  }, [load]);

  async function restore(id: string) {
    await api(`/notes/${id}/restore`, { method: "POST" });
    notesChanged();
    load();
  }
  async function destroy(id: string) {
    if (!confirm("Delete forever? This can't be undone.")) return;
    await api(`/notes/${id}?forever=1`, { method: "DELETE" });
    load();
  }
  async function empty() {
    if (!confirm("Empty the trash? Everything in it is deleted forever.")) return;
    await api("/notes/trash/empty", { method: "POST" });
    load();
  }

  return (
    <>
      <Topbar crumbs={<span className="crumb current">Trash</span>}>
        {!!items?.length && <button className="text-btn danger" onClick={empty}>Empty trash</button>}
      </Topbar>
      <div className="page">
        <h1 className="page-heading">Trash</h1>
        {items?.length === 0 && <p className="muted">Trash is empty.</p>}
        <ul className="list">
          {items?.map((i) => (
            <li key={i.id}>
              <span className="list-main">{i.icon ? `${i.icon} ` : <PageGlyph />} {i.title || "Untitled"}</span>
              <span className="muted small">{new Date(i.deleted_at).toLocaleDateString()}</span>
              <button className="text-btn" onClick={() => restore(i.id)}>Restore</button>
              <button className="text-btn danger" onClick={() => destroy(i.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
