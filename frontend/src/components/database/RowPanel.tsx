"use client";
import Link from "next/link";
import type { Column } from "@/lib/api";
import NoteEditor, { SyncDot } from "../NoteEditor";
import { PropertyCell } from "./PropertyCell";

// A database row opened on the side: properties on top, a full page below.
export default function RowPanel({ rowId, columns, onClose }: { rowId: string; columns: Column[]; onClose: () => void }) {
  return (
    <div className="panel-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="panel">
        <NoteEditor
          id={rowId}
          header={({ sync, save }) => (
            <div className="panel-bar">
              <button className="icon-btn" onClick={onClose} title="Close">✕</button>
              <Link href={`/edit/${rowId}`} className="ghost-link">Open as page</Link>
              <span style={{ flex: 1 }} />
              <SyncDot sync={sync} save={save} />
            </div>
          )}
          beforeEditor={({ note, change }) =>
            columns.length ? (
              <div className="props">
                {columns.map((c) => (
                  <div key={c.id} className="prop">
                    <span className="prop-name">{c.name}</span>
                    <PropertyCell
                      column={c}
                      value={note.properties?.[c.id]}
                      editable
                      onSave={(v) => change({ properties: { ...note.properties, [c.id]: v } })}
                    />
                  </div>
                ))}
              </div>
            ) : null
          }
        />
      </aside>
    </div>
  );
}
