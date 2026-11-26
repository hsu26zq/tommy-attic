"use client";
import { useEffect, useState } from "react";
import { resolveFileUrl } from "@/lib/files";
import { GRADIENTS } from "../Cover";
import { render } from "./PropertyCell";
import type { DbApi } from "./shared";

// Cards in a grid: the row's cover on top (set it by opening the row), name and a few properties below.
function CardCover({ cover }: { cover?: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const gradient = cover ? GRADIENTS[cover] : undefined;
  useEffect(() => {
    if (!cover || gradient) return;
    let alive = true;
    resolveFileUrl(cover).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [cover, gradient]);
  if (!cover) return null;
  return (
    <div className="g-cover" style={gradient ? { background: gradient } : undefined}>
      {src && <img src={src} alt="" loading="lazy" />}
    </div>
  );
}

export default function GalleryView({ db, rows, editable, addRow, openRow }: DbApi) {
  // cards without a cover stay compact; give a row a cover by opening it
  const shown = db.columns.filter((c) => c.type !== "checkbox").slice(0, 3);
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  return (
    <div className="gallery">
      {sorted.map((r) => (
        <button key={r.id} className="g-card" onClick={() => openRow(r.id)}>
          <CardCover cover={r.cover} />
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
