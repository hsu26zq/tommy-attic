"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Note } from "@/lib/api";
import { notesChanged } from "@/lib/notesEvents";
import { EditorClient } from "./ClientOnly";
import type { EditorHandle, SyncStatus } from "./Editor";

type Pending = Partial<Pick<Note, "title" | "icon" | "is_public" | "content" | "markdown" | "properties">>;
export type SaveState = "saved" | "saving" | "unsaved" | "error";

export type NoteCtx = {
  note: Note;
  change: (p: Pending) => void;
  sync: SyncStatus;
  save: SaveState;
  handle: React.MutableRefObject<EditorHandle | null>;
};

const ICONS = ["📄", "📝", "📌", "💡", "📚", "🧠", "⚙️", "🔧", "💻", "🧪", "📊", "🗂️", "✅", "⭐", "🔥", "🎯", "🏠", "✈️", "🎵", "❤️"];

// Loads one note, autosaves changes, and renders icon + title + live editor.
export default function NoteEditor({
  id,
  header,
  beforeEditor,
  after,
}: {
  id: string;
  header?: (ctx: NoteCtx) => ReactNode;
  beforeEditor?: (ctx: NoteCtx) => ReactNode;
  after?: (ctx: NoteCtx) => ReactNode;
}) {
  const [note, setNote] = useState<Note | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [sync, setSync] = useState<SyncStatus>("connecting");
  const [loadError, setLoadError] = useState("");
  const [picker, setPicker] = useState(false);
  const pending = useRef<Pending>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const handle = useRef<EditorHandle | null>(null);

  useEffect(() => {
    setNote(null);
    api<Note>(`/notes/${id}`)
      .then(setNote)
      .catch((e) => setLoadError((e as Error).message));
  }, [id]);

  const flush = useCallback(async () => {
    if (saving.current) return;
    const changes = pending.current;
    if (!Object.keys(changes).length) return;
    pending.current = {};
    saving.current = true;
    setSave("saving");
    try {
      await api(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
      setSave(Object.keys(pending.current).length ? "unsaved" : "saved");
      if ("title" in changes || "icon" in changes || "is_public" in changes) notesChanged();
    } catch {
      pending.current = { ...changes, ...pending.current };
      setSave("error");
    } finally {
      saving.current = false;
      if (Object.keys(pending.current).length) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 800);
      }
    }
  }, [id]);

  const change = useCallback(
    (p: Pending) => {
      setNote((n) => (n ? { ...n, ...p } : n));
      pending.current = { ...pending.current, ...p };
      setSave("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush],
  );

  // Save before leaving
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      flush();
    };
  }, [flush]);

  const onReady = useCallback((h: EditorHandle) => (handle.current = h), []);
  const onEdit = useCallback((content: unknown[], markdown: string) => change({ content, markdown }), [change]);

  if (loadError) return <p className="muted">{loadError}</p>;
  if (!note) return <p className="muted small">Loading…</p>;

  const ctx: NoteCtx = { note, change, sync, save, handle };

  return (
    <>
      {header?.(ctx)}
      <div className="page">
        <div className="page-icon-row">
          {note.icon ? (
            <button className="page-icon" onClick={() => setPicker(!picker)}>{note.icon}</button>
          ) : (
            <button className="add-icon" onClick={() => setPicker(!picker)}>Add icon</button>
          )}
          {picker && (
            <div className="icon-picker" onMouseLeave={() => setPicker(false)}>
              {ICONS.map((i) => (
                <button key={i} onClick={() => { change({ icon: i }); setPicker(false); }}>{i}</button>
              ))}
              {note.icon && <button className="remove" onClick={() => { change({ icon: null }); setPicker(false); }}>Remove</button>}
            </div>
          )}
        </div>
        <input
          className="page-title"
          value={note.title === "Untitled" ? "" : note.title}
          placeholder="Untitled"
          onChange={(e) => change({ title: e.target.value || "Untitled" })}
          onKeyDown={(e) => e.key === "Enter" && handle.current?.editor?.focus()}
        />
        {beforeEditor?.(ctx)}
        <EditorClient key={note.id} noteId={note.id} initialContent={note.content} onChange={onEdit} onStatus={setSync} onReady={onReady} />
        {after?.(ctx)}
      </div>
    </>
  );
}

export function SyncDot({ sync, save }: { sync: SyncStatus; save: SaveState }) {
  const text =
    save === "error" ? "Not saved" : save === "saving" || save === "unsaved" ? "Saving…" : sync === "offline" ? "Offline" : sync === "connecting" ? "Connecting…" : "Saved";
  return (
    <span className={`sync ${sync} ${save}`} title={sync === "synced" ? "Live sync on" : ""}>
      <span className="dot" />
      {text}
    </span>
  );
}
