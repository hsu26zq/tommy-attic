"use client";
import { render } from "./PropertyCell";
import type { DbApi } from "./shared";

// Cards in a grid: name and a few properties.
export default function GalleryView({ db, rows, editable, addRow, openRow }: DbApi) {
  const shown = db.columns.filter((c) => c.type !== "checkbox").slice(0, 3);
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  return (
    <div className="gallery">
      {sorted.map((r) => (
        <button key={r.id} className="g-card" onClick={() => openRow(r.id)}>
          <span className="g-body">
            <span className="card-title">{r.icon ? `${r.icon} ` : ""}{r.title || "Untitled"}</span>
            {shown.map((c) => {
              const v = render(c, r.properties[c.id]);
              return v ? <span key={c.id} className="card-prop">{v}</span> : null;
            })}
          </span>
        </button>
      ))}
      {editable && (
        <button className="g-card g-new" onClick={async () => openRow((await addRow()).id)}>
          + New
        </button>
      )}
    </div>
  );
}
