"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type Note } from "@/lib/api";
import { EditorClient } from "@/components/ClientOnly";
import { notesChanged } from "@/lib/notesEvents";

type Pending = Partial<Pick<Note, "title" | "type" | "is_public" | "content" | "markdown">>;

export default function EditNote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [state, setState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [conflict, setConflict] = useState(false);
  const [loadError, setLoadError] = useState("");
  const pending = useRef<Pending>({});
  const base = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    setNote(null);
    api<Note>(`/notes/${id}`)
      .then((n) => {
        base.current = n.updated_at;
        setNote(n);
      })
      .catch((e) => setLoadError((e as Error).message));
  }, [id]);

  const flush = useCallback(async () => {
    if (saving.current || conflict) return;
    const changes = pending.current;
    if (!Object.keys(changes).length) return;
    pending.current = {};
    saving.current = true;
    setState("saving");
    try {
      const saved = await api<Note>(`/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...changes, base_updated_at: base.current }),
      });
      base.current = saved.updated_at;
      setNote((n) => (n ? { ...n, ...saved } : n));
      setState(Object.keys(pending.current).length ? "unsaved" : "saved");
      if ("title" in changes || "is_public" in changes || "type" in changes) notesChanged();
    } catch (e) {
      if ((e as { status?: number }).status === 409) setConflict(true);
      pending.current = { ...changes, ...pending.current };
      setState("error");
    } finally {
      saving.current = false;
      if (Object.keys(pending.current).length && !conflict) schedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, conflict]);

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }

  function change(p: Pending) {
    pending.current = { ...pending.current, ...p };
    setState("unsaved");
    schedule();
  }

  // Save before leaving the page
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

  async function remove() {
    if (!confirm("Delete this note? This can't be undone.")) return;
    pending.current = {};
    await api(`/notes/${id}`, { method: "DELETE" });
    notesChanged();
    router.replace("/edit");
  }

  if (loadError) return <div className="notice">{loadError}</div>;
  if (!note) return <p className="muted">Loading…</p>;

  const publicUrl = note.is_public && note.slug ? `/${note.type === "post" ? "blog" : "notes"}/${note.slug}` : null;
  const label = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved", error: "Not saved" }[state];

  return (
    <div className="doc">
      <div className="doc-toolbar">
        <div className="row">
          <div className="toggle" title="Note or blog post">
            <button className={note.type === "note" ? "on" : ""} onClick={() => { setNote({ ...note, type: "note" }); change({ type: "note" }); }}>Note</button>
            <button className={note.type === "post" ? "on" : ""} onClick={() => { setNote({ ...note, type: "post" }); change({ type: "post" }); }}>Post</button>
          </div>
          <div className="toggle" title="Who can see it">
            <button className={!note.is_public ? "on" : ""} onClick={() => { setNote({ ...note, is_public: false }); change({ is_public: false }); }}>Private</button>
            <button className={note.is_public ? "on" : ""} onClick={() => { setNote({ ...note, is_public: true }); change({ is_public: true }); }}>Public</button>
          </div>
          {publicUrl && <Link href={publicUrl} target="_blank" className="small">View public page ↗</Link>}
        </div>
        <div className="row">
          <span className="save-state">{label}</span>
          <button className="btn small danger" onClick={remove}>Delete</button>
        </div>
      </div>

      {conflict && (
        <div className="notice">
          This note was changed on another device. <button className="btn small secondary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}

      <input
        className="title-input"
        value={note.title}
        placeholder="Untitled"
        onChange={(e) => {
          setNote({ ...note, title: e.target.value });
          change({ title: e.target.value });
        }}
      />
      <EditorClient
        key={note.id}
        initialContent={note.content}
        onChange={(content, markdown) => change({ content, markdown })}
      />
    </div>
  );
}
