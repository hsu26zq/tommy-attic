"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, type NoteSummary } from "@/lib/api";
import { notesChanged, openSearch } from "@/lib/notesEvents";
import MoveDialog from "./MoveDialog";

const EXPANDED_KEY = "ta_expanded";

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function Sidebar({ notes, open, onClose }: { notes: NoteSummary[] | null; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const path = usePathname();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  useEffect(() => setExpanded(loadExpanded()), []);
  useEffect(() => onClose(), [path]); // eslint-disable-line react-hooks/exhaustive-deps

  const children = useMemo(() => {
    const map = new Map<string | null, NoteSummary[]>();
    for (const n of notes ?? []) {
      const k = n.parent_id ?? null;
      map.set(k, [...(map.get(k) ?? []), n]);
    }
    return map;
  }, [notes]);

  // Keep the open page's parents expanded
  useEffect(() => {
    const id = path.startsWith("/edit/") ? path.split("/")[2] : null;
    if (!id || !notes) return;
    const byId = new Map(notes.map((n) => [n.id, n]));
    let cur = byId.get(id)?.parent_id;
    const add: string[] = [];
    while (cur) {
      add.push(cur);
      cur = byId.get(cur)?.parent_id;
    }
    if (add.length) setExpanded((s) => new Set([...s, ...add]));
  }, [path, notes]);

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  async function create(parent_id: string | null) {
    const note = await api<NoteSummary>("/notes", { method: "POST", body: JSON.stringify({ parent_id }) });
    if (parent_id) setExpanded((s) => new Set([...s, parent_id]));
    notesChanged();
    router.push(`/edit/${note.id}`);
  }

  async function trash(id: string) {
    await api(`/notes/${id}`, { method: "DELETE" });
    notesChanged();
    if (path.startsWith(`/edit/${id}`)) router.replace("/edit");
  }

  // Right-click (or long-press on a phone) a page for its actions
  const menuProps = (id: string) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setMenu({ id, x: e.clientX, y: e.clientY });
    },
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      press.current = setTimeout(() => setMenu({ id, x: t.clientX, y: t.clientY }), 500);
    },
    onTouchEnd: () => press.current && clearTimeout(press.current),
    onTouchMove: () => press.current && clearTimeout(press.current),
  });

  function Tree({ parent, depth }: { parent: string | null; depth: number }) {
    const items = children.get(parent) ?? [];
    return (
      <>
        {items.map((n) => {
          const kids = children.get(n.id)?.length ?? 0;
          const isOpen = expanded.has(n.id);
          return (
            <div key={n.id}>
              <div className={`tree-item ${path === `/edit/${n.id}` ? "active" : ""}`} style={{ paddingLeft: 6 + depth * 14 }} {...menuProps(n.id)}>
                <button className={`chev ${kids ? "" : "empty"} ${isOpen ? "open" : ""}`} onClick={() => kids && toggle(n.id)} aria-label="Expand">
                  ›
                </button>
                <Link href={`/edit/${n.id}`} className="tree-link">
                  <span className="tree-icon">{n.icon || "📄"}</span>
                  <span className="tree-title">{n.title || "Untitled"}</span>
                </Link>
                <button className="tree-add" onClick={() => create(n.id)} title="Add a page inside">+</button>
              </div>
              {kids > 0 && isOpen && <Tree parent={n.id} depth={depth + 1} />}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      <div className={`sidebar-backdrop ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="side-actions">
          <button className="side-btn" onClick={openSearch}>
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
          <button className="side-btn" onClick={() => create(null)}>
            <span>New page</span>
          </button>
        </div>
        <div className="tree">
          {notes === null ? (
            <p className="muted small side-pad">Loading… (up to a minute if the server was asleep)</p>
          ) : notes.length === 0 ? (
            <p className="muted small side-pad">No pages yet.</p>
          ) : (
            <Tree parent={null} depth={0} />
          )}
        </div>
        <div className="side-bottom">
          <Link href="/edit/import" className={`side-link ${path === "/edit/import" ? "active" : ""}`}>Import</Link>
          <Link href="/edit/trash" className={`side-link ${path === "/edit/trash" ? "active" : ""}`}>Trash</Link>
        </div>
      </aside>
      {menu && (
        <div className="context-menu" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 140) }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setMenu(null); router.push(`/edit/${menu.id}?history=1`); }}>Version history</button>
          <button onClick={() => { setMenu(null); setMoving(menu.id); }}>Move to</button>
          <button className="danger" onClick={() => { setMenu(null); trash(menu.id); }}>Delete</button>
        </div>
      )}
      {moving && <MoveDialog noteId={moving} onClose={() => setMoving(null)} />}
    </>
  );
}
