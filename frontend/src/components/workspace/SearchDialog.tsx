"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { onOpenSearch } from "@/lib/notesEvents";

type Hit = { id: string; title: string; icon: string | null; snippet: string; isRow: boolean };

// Ctrl+K / ⌘K: find any note by title or text.
export default function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    const off = onOpenSearch(() => setOpen(true));
    return () => {
      window.removeEventListener("keydown", key);
      off();
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) return setHits([]);
    const t = setTimeout(() => {
      api<Hit[]>(`/notes/search?q=${encodeURIComponent(q)}`).then((h) => {
        setHits(h);
        setSel(0);
      }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function go(h: Hit) {
    setOpen(false);
    router.push(`/edit/${h.id}`);
  }

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="search">
        <input
          ref={input}
          value={q}
          placeholder="Search notes…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter" && hits[sel]) go(hits[sel]);
          }}
        />
        {q.trim() && (
          <ul className="search-hits">
            {hits.length === 0 && <li className="muted small search-empty">No results</li>}
            {hits.map((h, i) => (
              <li key={h.id} className={i === sel ? "sel" : ""} onMouseEnter={() => setSel(i)} onMouseDown={() => go(h)}>
                <span className="hit-icon">{h.icon || "📄"}</span>
                <span className="hit-text">
                  <span className="hit-title">{h.title || "Untitled"}</span>
                  {h.snippet && <span className="hit-snippet">{h.snippet}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
