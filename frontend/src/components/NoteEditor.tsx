"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Note } from "@/lib/api";
import { notesChanged } from "@/lib/notesEvents";
import { rememberOpened } from "@/lib/recent";
import { cachedNote, fetchNote, updateCached } from "@/lib/noteCache";
import { useWorkspace } from "./workspace/Workspace";
import Cover, { CoverPicker } from "./Cover";
import { EditorClient } from "./ClientOnly";
import EditorBoundary from "./EditorBoundary";
import type { EditorHandle } from "./Editor";

type Pending = Partial<Pick<Note, "title" | "icon" | "cover" | "is_public" | "content" | "markdown" | "properties" | "ydoc">>;
export type SaveState = "saved" | "saving" | "unsaved" | "error";

export type NoteCtx = {
  note: Note;
  change: (p: Pending) => void;
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
  const [loadError, setLoadError] = useState("");
  const [picker, setPicker] = useState(false);
  const [coverPicker, setCoverPicker] = useState(false);
  const { notes } = useWorkspace();
  const pending = useRef<Pending>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const handle = useRef<EditorHandle | null>(null);
  const snap = useRef<(() => { content: unknown[]; markdown: string; ydoc: string }) | null>(null);

  useEffect(() => {
    rememberOpened(id);
    setLoadError("");
    // Seen before? Show it right away, then refresh the page's details quietly.
    // (The text itself stays live through sync, so only the details are refreshed.)
    const cached = cachedNote(id);
    setNote(cached ?? null);
    fetchNote(id)
      .then((fresh) =>
        setNote((cur) =>
          cur && cur.id === id
            ? { ...cur, title: fresh.title, icon: fresh.icon, cover: fresh.cover, wide: fresh.wide, is_public: fresh.is_public, slug: fresh.slug, properties: fresh.properties, path: fresh.path }
            : fresh,
        ),
      )
      .catch((e) => !cached && setLoadError((e as Error).message));
  }, [id]);

  const flush = useCallback(async () => {
    if (saving.current) return;
    if (snap.current) {
      try {
        const s = snap.current();
        pending.current = { ...pending.current, ...s };
        updateCached(id, s as Partial<Note>);
      } catch {}
      snap.current = null;
    }
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
      updateCached(id, p);
      pending.current = { ...pending.current, ...p };
      setSave("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush, id],
  );

  // Save before leaving
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || snap.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      flush();
    };
  }, [flush]);

  const onReady = useCallback((h: EditorHandle) => (handle.current = h), []);
  // Typing only marks the page as changed; its content is read once, when it's saved
  const onEdit = useCallback(
    (snapshot: () => { content: unknown[]; markdown: string; ydoc: string }) => {
      snap.current = snapshot;
      setSave("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush],
  );

  if (loadError) return <p className="muted">{loadError}</p>;
  if (!note)
    return (
      <div className="page" aria-busy="true">
        <div className="page-icon-row" />
        <div className="skel skel-title" />
        <div className="skel skel-line" />
        <div className="skel skel-line short" />
      </div>
    );

  const ctx: NoteCtx = { note, change, handle };
  // "Wide page" is switched from the sidebar menu, so read it from the page list
  const wide = notes?.find((n) => n.id === note.id)?.wide ?? note.wide;

  return (
    <>
      {header?.(ctx)}
      {save === "error" && <div className="save-error">Couldn&apos;t save. Retrying…</div>}
      {note.cover && <Cover cover={note.cover} onChange={(cover) => change({ cover })} />}
      <div className={`page ${wide ? "wide" : ""} ${note.cover ? "has-cover" : ""}`}>
        <div className="page-icon-row">
          {note.icon && <button className="page-icon" onClick={() => setPicker(!picker)}>{note.icon}</button>}
          <div className="page-adds">
            {!note.icon && <button className="add-icon" onClick={() => setPicker(!picker)}>Add icon</button>}
            {!note.cover && <button className="add-icon" onClick={() => setCoverPicker(!coverPicker)}>Add cover</button>}
          </div>
          {coverPicker && (
            <CoverPicker
              onPick={(cover) => {
                setCoverPicker(false);
                change({ cover });
              }}
              onClose={() => setCoverPicker(false)}
            />
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
          onKeyDown={(e) => {
            // Enter or ↓ jumps into the page's first line
            if (e.key !== "Enter" && e.key !== "ArrowDown") return;
            const ed = handle.current?.editor;
            if (!ed) return;
            e.preventDefault();
            try {
              ed.setTextCursorPosition(ed.document[0], "start");
            } catch {}
            ed.focus();
          }}
        />
        {beforeEditor?.(ctx)}
        <EditorBoundary key={note.id}>
          <EditorClient noteId={note.id} initialContent={note.content} initialYdoc={note.ydoc} onChange={onEdit} onReady={onReady} />
        </EditorBoundary>
        {after?.(ctx)}
      </div>
    </>
  );
}

