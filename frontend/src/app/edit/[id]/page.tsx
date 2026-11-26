"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { notesChanged } from "@/lib/notesEvents";
import NoteEditor, { SyncDot, type NoteCtx } from "@/components/NoteEditor";
import { Topbar } from "@/components/workspace/Workspace";
import MoveDialog from "@/components/workspace/MoveDialog";
import HistoryPanel from "@/components/workspace/HistoryPanel";

type LinkedNote = { id: string; title: string; icon: string | null };

function Backlinks({ id }: { id: string }) {
  const [links, setLinks] = useState<LinkedNote[]>([]);
  useEffect(() => {
    api<LinkedNote[]>(`/notes/${id}/backlinks`).then(setLinks).catch(() => {});
  }, [id]);
  if (!links.length) return null;
  return (
    <div className="backlinks">
      <div className="backlinks-title">Linked from</div>
      {links.map((l) => (
        <Link key={l.id} href={`/edit/${l.id}`} className="backlink">
          {l.icon || "📄"} {l.title || "Untitled"}
        </Link>
      ))}
    </div>
  );
}

function PageBar({ ctx, onMove, onHistory }: { ctx: NoteCtx; onMove: () => void; onHistory: () => void }) {
  const router = useRouter();
  const { note, change, sync, save } = ctx;
  const [share, setShare] = useState(false);
  const [menu, setMenu] = useState(false);
  const publicUrl = note.is_public && note.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/notes/${note.slug}` : "";

  async function trash() {
    await api(`/notes/${note.id}`, { method: "DELETE" });
    notesChanged();
    router.replace("/edit");
  }

  return (
    <Topbar
      crumbs={
        <>
          {note.path.map((p) => (
            <span key={p.id} className="crumb">
              <Link href={`/edit/${p.id}`}>{p.icon ? `${p.icon} ` : ""}{p.title || "Untitled"}</Link>
              <span className="crumb-sep">/</span>
            </span>
          ))}
          <span className="crumb current">{note.icon ? `${note.icon} ` : ""}{note.title || "Untitled"}</span>
        </>
      }
    >
      <SyncDot sync={sync} save={save} />
      <div className="pop-wrap">
        <button className="text-btn" onClick={() => { setShare(!share); setMenu(false); }}>{note.is_public ? "Public" : "Share"}</button>
        {share && (
          <div className="pop" onMouseLeave={() => setShare(false)}>
            <label className="switch-row">
              <span>
                <b>Publish to web</b>
                <span className="muted small">Anyone with the link can read it</span>
              </span>
              <input type="checkbox" checked={note.is_public} onChange={(e) => change({ is_public: e.target.checked })} />
            </label>
            {publicUrl && (
              <div className="row">
                <input readOnly value={publicUrl} onFocus={(e) => e.target.select()} />
                <button className="btn small" onClick={() => navigator.clipboard.writeText(publicUrl)}>Copy</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="pop-wrap">
        <button className="icon-btn" onClick={() => { setMenu(!menu); setShare(false); }} aria-label="More">⋯</button>
        {menu && (
          <div className="pop menu" onMouseLeave={() => setMenu(false)}>
            <button onClick={() => { setMenu(false); onHistory(); }}>Version history</button>
            <button onClick={() => { setMenu(false); onMove(); }}>Move to</button>
            <button className="danger" onClick={trash}>Move to trash</button>
          </div>
        )}
      </div>
    </Topbar>
  );
}

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [moving, setMoving] = useState(false);
  const [history, setHistory] = useState(false);
  const [rev, setRev] = useState(0);

  return (
    <NoteEditor
      key={`${id}-${rev}`}
      id={id}
      header={(ctx) => (
        <>
          <PageBar ctx={ctx} onMove={() => setMoving(true)} onHistory={() => setHistory(true)} />
          {moving && (
            <MoveDialog
              noteId={id}
              onClose={() => {
                setMoving(false);
                setRev((r) => r + 1); // reload breadcrumbs
              }}
            />
          )}
          {history && (
            <HistoryPanel
              noteId={id}
              onClose={() => setHistory(false)}
              onRestore={(v) => {
                ctx.handle.current?.replaceContent(v.content);
                ctx.change({ title: v.title });
                setHistory(false);
              }}
            />
          )}
        </>
      )}
      after={() => <Backlinks id={id} />}
    />
  );
}
