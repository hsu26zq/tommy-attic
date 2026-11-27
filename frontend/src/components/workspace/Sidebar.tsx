"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, type NoteSummary } from "@/lib/api";
import { notesChanged, openSearch } from "@/lib/notesEvents";
import { copyText, downloadMarkdown, toast } from "@/lib/exportNote";
import MoveDialog from "./MoveDialog";
import { cancelPrefetch, forgetNote, prefetchNote } from "@/lib/noteCache";
import { PageGlyph, PanelIcon } from "./icons";

const EXPANDED_KEY = "ta_expanded";
type Zone = "before" | "inside" | "after";

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function Sidebar({ notes, open, onClose, onHide }: { notes: NoteSummary[] | null; open: boolean; onClose: () => void; onHide: () => void }) {
  const router = useRouter();
  const path = usePathname();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; zone: Zone } | null>(null);
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

  const byId = useMemo(() => new Map((notes ?? []).map((n) => [n.id, n])), [notes]);
  const children = useMemo(() => {
    const map = new Map<string | null, NoteSummary[]>();
    for (const n of notes ?? []) {
      const k = n.parent_id ?? null;
      map.set(k, [...(map.get(k) ?? []), n]);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [notes]);
  const pinned = useMemo(() => (notes ?? []).filter((n) => n.pinned), [notes]);

  // Keep the open page's parents expanded
  useEffect(() => {
    const id = path.startsWith("/edit/") ? path.split("/")[2] : null;
    if (!id || !notes) return;
    let cur = byId.get(id)?.parent_id;
    const add: string[] = [];
    while (cur) {
      add.push(cur);
      cur = byId.get(cur)?.parent_id;
    }
    if (add.length) setExpanded((s) => new Set([...s, ...add]));
  }, [path, notes, byId]);

  function saveExpanded(next: Set<string>) {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
    } catch {}
  }

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveExpanded(next);
      return next;
    });
  }

  function expand(id: string) {
    setExpanded((s) => {
      const next = new Set([...s, id]);
      saveExpanded(next);
      return next;
    });
  }

  async function create(parent_id: string | null) {
    const note = await api<NoteSummary>("/notes", { method: "POST", body: JSON.stringify({ parent_id }) });
    if (parent_id) expand(parent_id);
    notesChanged();
    router.push(`/edit/${note.id}`);
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await api(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    forgetNote(id);
    notesChanged();
  };

  async function trash(id: string) {
    await api(`/notes/${id}`, { method: "DELETE" });
    forgetNote(id);
    notesChanged();
    const wasOpen = path.startsWith(`/edit/${id}`);
    if (wasOpen) router.replace("/edit");
    toast("Moved to trash", {
      label: "Undo",
      run: async () => {
        await api(`/notes/${id}/restore`, { method: "POST" });
        notesChanged();
        if (wasOpen) router.push(`/edit/${id}`);
      },
    });
  }

  async function duplicate(id: string) {
    const copy = await api<NoteSummary>(`/notes/${id}/duplicate`, { method: "POST" });
    notesChanged();
    router.push(`/edit/${copy.id}`);
  }

  // ---------- drag pages to reorder, or drop onto a page to put it inside ----------
  function isInside(id: string, ancestor: string) {
    let cur: string | null | undefined = id;
    while (cur) {
      if (cur === ancestor) return true;
      cur = byId.get(cur)?.parent_id;
    }
    return false;
  }

  function onDragOver(e: React.DragEvent, target: NoteSummary) {
    if (!dragId || dragId === target.id || isInside(target.id, dragId)) return;
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    const zone: Zone = y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
    if (drop?.id !== target.id || drop.zone !== zone) setDrop({ id: target.id, zone });
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const d = drop;
    const id = dragId;
    setDrop(null);
    setDragId(null);
    if (!d || !id) return;
    const target = byId.get(d.id);
    if (!target) return;
    if (d.zone === "inside") {
      const kids = (children.get(target.id) ?? []).filter((n) => n.id !== id);
      expand(target.id);
      return patch(id, { parent_id: target.id, position: (kids.at(-1)?.position ?? 0) + 1 });
    }
    const siblings = (children.get(target.parent_id ?? null) ?? []).filter((n) => n.id !== id);
    const i = siblings.findIndex((n) => n.id === target.id);
    const neighbor = d.zone === "before" ? siblings[i - 1] : siblings[i + 1];
    const position = neighbor ? (target.position + neighbor.position) / 2 : target.position + (d.zone === "before" ? -1 : 1);
    return patch(id, { parent_id: target.parent_id ?? null, position });
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

  function row(n: NoteSummary, depth: number, inTree: boolean) {
    const kids = inTree ? (children.get(n.id)?.length ?? 0) : 0;
    const isOpen = expanded.has(n.id);
    const zone = inTree && drop?.id === n.id ? drop.zone : null;
    return (
      <div
        className={`tree-item ${path === `/edit/${n.id}` ? "active" : ""} ${zone ? `drop-${zone}` : ""} ${dragId === n.id ? "dragging" : ""}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={inTree && renaming !== n.id}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", n.id);
          setDragId(n.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDrop(null);
        }}
        onDragOver={inTree ? (e) => onDragOver(e, n) : undefined}
        onDrop={inTree ? onDrop : undefined}
        {...menuProps(n.id)}
      >
        {inTree ? (
          <button className={`chev ${kids ? "" : "empty"} ${isOpen ? "open" : ""}`} onClick={() => kids && toggle(n.id)} aria-label="Expand">
            ›
          </button>
        ) : (
          <span className="chev empty" />
        )}
        {renaming === n.id ? (
          <input
            className="tree-rename"
            autoFocus
            defaultValue={n.title === "Untitled" ? "" : n.title}
            placeholder="Untitled"
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={(e) => {
              const title = e.currentTarget.value.trim() || "Untitled";
              setRenaming(null);
              if (title !== n.title) patch(n.id, { title });
            }}
          />
        ) : (
          <Link href={`/edit/${n.id}`} className="tree-link" draggable={false} onMouseEnter={() => prefetchNote(n.id)} onMouseLeave={cancelPrefetch}>
            <span className="tree-icon">{n.icon || <PageGlyph />}</span>
            <span className="tree-title">{n.title || "Untitled"}</span>
          </Link>
        )}
        {inTree && <button className="tree-add" onClick={() => create(n.id)} title="Add a page inside">+</button>}
      </div>
    );
  }

  function tree(parent: string | null, depth: number): React.ReactNode {
    return (children.get(parent) ?? []).map((n) => (
      <div key={n.id}>
        {row(n, depth, true)}
        {(children.get(n.id)?.length ?? 0) > 0 && expanded.has(n.id) && tree(n.id, depth + 1)}
      </div>
    ));
  }

  const target = menu ? byId.get(menu.id) : null;
  const act = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };

  return (
    <>
      <div className={`sidebar-backdrop ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="side-actions">
          <div className="side-row">
            <button className="side-btn" onClick={openSearch}>
              <span>Search</span>
            </button>
            <button className="icon-btn hide-side" onClick={onHide} title={"Hide sidebar (Ctrl+\\)"}>
              <PanelIcon />
            </button>
          </div>
          <button className="side-btn" onClick={() => create(null)}>
            <span>New page</span>
          </button>
        </div>
        <div
          className="tree"
          onDragOver={(e) => dragId && e.preventDefault()}
          onDrop={(e) => {
            // Dropped on the empty space below the list: move to the end, top level
            if (!dragId) return;
            e.preventDefault();
            const top = (children.get(null) ?? []).filter((n) => n.id !== dragId);
            patch(dragId, { parent_id: null, position: (top.at(-1)?.position ?? 0) + 1 });
            setDragId(null);
            setDrop(null);
          }}
        >
          {notes === null ? (
            <div className="side-skel" aria-busy="true">
              <div className="skel" /><div className="skel" /><div className="skel" />
            </div>
          ) : notes.length === 0 ? (
            <p className="muted small side-pad">No pages yet.</p>
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  <div className="side-label">Pinned</div>
                  {pinned.map((n) => <div key={n.id}>{row(n, 0, false)}</div>)}
                  <div className="side-label">Pages</div>
                </>
              )}
              {tree(null, 0)}
            </>
          )}
        </div>
        <div className="side-bottom">
          <Link href="/edit/trash" className={`side-link ${path === "/edit/trash" ? "active" : ""}`}>Trash</Link>
        </div>
      </aside>
      {menu && target && (
        <div className="context-menu" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.max(8, Math.min(menu.y, window.innerHeight - 400)) }} onClick={(e) => e.stopPropagation()}>
          <button onClick={act(() => patch(target.id, { pinned: !target.pinned }))}>{target.pinned ? "Unpin" : "Pin"}</button>
          <button onClick={act(() => setRenaming(target.id))}>Rename</button>
          <button onClick={act(() => duplicate(target.id))}>Duplicate</button>
          <button onClick={act(() => patch(target.id, { wide: !target.wide }))}>
            Wide page <span className="menu-check">{target.wide ? "✓" : ""}</span>
          </button>
          <div className="menu-sep" />
          <button onClick={act(async () => toast((await copyText(`${location.origin}/edit/${target.id}`)) ? "Link copied" : "Couldn't copy"))}>Copy link</button>
          <button onClick={act(() => downloadMarkdown(target.id))}>Export as Markdown</button>
          <button onClick={act(() => router.push(`/edit/${target.id}?print=1`))}>Export as PDF</button>
          <div className="menu-sep" />
          <button onClick={act(() => router.push(`/edit/${target.id}?history=1`))}>Version history</button>
          <button onClick={act(() => setMoving(target.id))}>Move to</button>
          <button className="danger" onClick={act(() => trash(target.id))}>Delete</button>
        </div>
      )}
      {moving && <MoveDialog noteId={moving} onClose={() => setMoving(null)} />}
    </>
  );
}
