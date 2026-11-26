"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ViewerClient } from "../ClientOnly";

type Version = { id: string; title: string; created_at: string };
type Full = Version & { content: unknown[] };

// Earlier versions of a note (saved at most every 10 minutes). Preview and restore.
export default function HistoryPanel({
  noteId,
  onRestore,
  onClose,
}: {
  noteId: string;
  onRestore: (v: Full) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Version[] | null>(null);
  const [pick, setPick] = useState<Full | null>(null);

  useEffect(() => {
    api<Version[]>(`/notes/${noteId}/versions`).then(setList).catch(() => setList([]));
  }, [noteId]);

  async function open(v: Version) {
    setPick(await api<Full>(`/notes/${noteId}/versions/${v.id}`));
  }

  return (
    <div className="panel-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="panel history">
        <div className="panel-bar">
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
          <span className="strong">History</span>
          <span style={{ flex: 1 }} />
          {pick && (
            <button className="btn small" onClick={() => { if (confirm("Replace the current page with this version?")) onRestore(pick); }}>
              Restore this version
            </button>
          )}
        </div>
        <div className="history-body">
          <ul className="history-list">
            {list?.length === 0 && <li className="muted small">No earlier versions yet. They&apos;re saved as you edit, every 10 minutes at most.</li>}
            {list?.map((v) => (
              <li key={v.id} className={pick?.id === v.id ? "sel" : ""} onClick={() => open(v)}>
                {new Date(v.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
          <div className="history-preview">
            {pick ? (
              <div className="page">
                <h1 className="preview-title">{pick.title}</h1>
                <ViewerClient key={pick.id} content={pick.content} />
              </div>
            ) : (
              <p className="muted small">Pick a version to preview it.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
