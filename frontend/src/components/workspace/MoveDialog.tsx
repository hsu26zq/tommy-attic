"use client";
import { useEffect, useState } from "react";
import { api, type NoteSummary } from "@/lib/api";
import { notesChanged } from "@/lib/notesEvents";

// Move a page under another page (or to the top level).
export default function MoveDialog({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<NoteSummary[]>("/notes").then(setNotes).catch(() => {});
  }, []);

  // Can't move a page inside itself or its own sub-pages
  const blocked = new Set<string>([noteId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of notes) if (n.parent_id && blocked.has(n.parent_id) && !blocked.has(n.id)) { blocked.add(n.id); grew = true; }
  }

  const ordered: { n: NoteSummary; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const n of notes.filter((x) => (x.parent_id ?? null) === parent)) {
      if (blocked.has(n.id)) continue;
      ordered.push({ n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);

  async function move(parent_id: string | null) {
    try {
      await api(`/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ parent_id }) });
      notesChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-title">Move to</div>
        {error && <p className="error small">{error}</p>}
        <ul className="pick-list">
          <li onClick={() => move(null)}>Top level</li>
          {ordered.map(({ n, depth }) => (
            <li key={n.id} style={{ paddingLeft: 12 + depth * 16 }} onClick={() => move(n.id)}>
              {n.icon || "📄"} {n.title || "Untitled"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
