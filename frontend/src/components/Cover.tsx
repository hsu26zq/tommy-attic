"use client";
import { useEffect, useRef, useState } from "react";
import { resolveFileUrl, uploadFile } from "@/lib/files";

// Page cover: one of a few soft gradients, or your own picture.
export const GRADIENTS: Record<string, string> = {
  "g:clay": "linear-gradient(120deg, #f3d9c6 0%, #e4b293 100%)",
  "g:sage": "linear-gradient(120deg, #dfe8d6 0%, #a9bf9c 100%)",
  "g:dusk": "linear-gradient(120deg, #d9dff0 0%, #9daed6 100%)",
  "g:sand": "linear-gradient(120deg, #f4ecd8 0%, #dcc9a0 100%)",
  "g:plum": "linear-gradient(120deg, #eadcef 0%, #b99ac6 100%)",
  "g:ink": "linear-gradient(120deg, #4a4d57 0%, #23252b 100%)",
};

export function CoverPicker({ onPick, onClose }: { onPick: (cover: string) => void; onClose: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="cover-picker" onMouseLeave={onClose}>
      <div className="cover-swatches">
        {Object.entries(GRADIENTS).map(([k, g]) => (
          <button key={k} style={{ background: g }} onClick={() => onPick(k)} aria-label="Gradient" />
        ))}
      </div>
      <button className="cover-upload" disabled={busy} onClick={() => file.current?.click()}>
        {busy ? "Uploading…" : "Upload a picture"}
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            onPick(await uploadFile(f));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

export default function Cover({ cover, onChange }: { cover: string; onChange: (cover: string | null) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const gradient = GRADIENTS[cover];

  useEffect(() => {
    if (gradient) return setSrc(null);
    let alive = true;
    resolveFileUrl(cover).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [cover, gradient]);

  return (
    <div className="cover" style={gradient ? { background: gradient } : undefined}>
      {src && <img src={src} alt="" />}
      <div className="cover-actions">
        <button onClick={() => setPicking(!picking)}>Change</button>
        <button onClick={() => onChange(null)}>Remove</button>
      </div>
      {picking && (
        <CoverPicker
          onPick={(c) => {
            setPicking(false);
            onChange(c);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
