"use client";
import { useEffect, useRef } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Editor = any;

// Picking whole blocks without touching their text:
// - drag a box from the empty space around the page to select blocks
// - Esc while typing selects the block you're in
// - then Delete, Ctrl+C / Ctrl+X, Ctrl+D (duplicate), Ctrl+Shift+↑/↓ (move), or click anywhere to let go
// Also: a plain click below the last block starts a new line there.
const TOP_BLOCKS = ".bn-editor > .bn-block-group > .bn-block-outer";
const NOT_START = ".bn-block-content, .bn-side-menu, button, input, textarea, select, a, .page-title, .page-icon-row, .cover, .topbar, .backlinks, .popover, .context-menu, .bn-container [role=menu], .mantine-Popover-dropdown, .history";

export default function BlockSelect({ editor }: { editor: Editor }) {
  const selected = useRef<string[]>([]);

  useEffect(() => {
    const root = () => editor?.domElement as HTMLElement | undefined;
    const outers = () => Array.from(root()?.querySelectorAll<HTMLElement>(TOP_BLOCKS) ?? []);

    // The highlight is a style rule rather than a class: the editor redraws blocks and would wipe classes.
    const style = document.createElement("style");
    document.head.appendChild(style);
    function paint(ids: string[]) {
      selected.current = ids;
      style.textContent = ids.length
        ? `${ids.map((id) => `.bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block`).join(",")} { background: color-mix(in srgb, var(--accent) 11%, transparent); border-radius: 4px; }`
        : "";
      document.body.classList.toggle("blocks-selected", ids.length > 0);
    }
    const clear = () => selected.current.length && paint([]);
    const blocks = () => selected.current.map((id) => editor.getBlock(id)).filter(Boolean);
    // strip ids so copies get new ones
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fresh = (b: any): any => ({ type: b.type, props: b.props, content: b.content, children: (b.children ?? []).map(fresh) });

    // ---------- box drawing ----------
    let start: { x: number; y: number } | null = null;
    let box: HTMLDivElement | null = null;
    let base: string[] = [];

    function down(e: MouseEvent) {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (!t.closest(".main") || t.closest(NOT_START) || !root()) return;
      // a block with its own controls (drawing, database, PDF, embed) handles its own clicks
      if (t.closest(".bn-block-outer") && t.closest("[contenteditable=false]")) return;
      start = { x: e.clientX, y: e.clientY };
      base = e.shiftKey ? selected.current : [];
    }

    function move(e: MouseEvent) {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!box && Math.hypot(dx, dy) < 5) return;
      e.preventDefault();
      if (!box) {
        box = document.createElement("div");
        box.className = "select-box";
        document.body.appendChild(box);
        (document.activeElement as HTMLElement | null)?.blur();
        window.getSelection()?.removeAllRanges();
      }
      const l = Math.min(start.x, e.clientX), t = Math.min(start.y, e.clientY);
      const r = Math.max(start.x, e.clientX), b = Math.max(start.y, e.clientY);
      Object.assign(box.style, { left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
      // a block counts when the box crosses its height (the box needn't reach the text sideways)
      const hit = outers()
        .filter((el) => {
          const rc = el.getBoundingClientRect();
          return rc.bottom > t && rc.top < b;
        })
        .map((el) => el.dataset.id ?? "");
      paint([...new Set([...base, ...hit])]);
    }

    function up(e: MouseEvent) {
      if (!start) return;
      const wasBox = !!box;
      box?.remove();
      box = null;
      const s = start;
      start = null;
      if (wasBox) return;
      // plain click in empty space: let go of any selection; below the last block → start typing there
      clear();
      const list = outers();
      const last = list.at(-1);
      if (!last || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 5) return;
      if (e.clientY > last.getBoundingClientRect().bottom) {
        const doc = editor.document;
        const end = doc.at(-1);
        const emptyPara = end?.type === "paragraph" && (!end.content || end.content.length === 0);
        if (!emptyPara) editor.insertBlocks([{ type: "paragraph" }], end, "after");
        editor.setTextCursorPosition(editor.document.at(-1), "end");
        editor.focus();
      }
    }

    // ---------- keys ----------
    function key(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const inEditor = !!root()?.contains(document.activeElement);

      // Esc while typing: select the block you're in
      if (e.key === "Escape" && inEditor && !selected.current.length) {
        if (document.querySelector(".bn-suggestion-menu, .mantine-Popover-dropdown")) return;
        const b = editor.getTextCursorPosition?.().block;
        if (!b) return;
        // only top-level blocks can be box-selected; climb to it
        let el = root()?.querySelector<HTMLElement>(`.bn-block-outer[data-id="${b.id}"]`);
        while (el && !el.matches(TOP_BLOCKS)) el = el.parentElement?.closest<HTMLElement>(".bn-block-outer") ?? null;
        if (!el) return;
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        paint([el.dataset.id ?? ""]);
        return;
      }

      // while typing: Ctrl+D duplicates the block, Ctrl+Shift+↑/↓ moves it
      if (inEditor && !selected.current.length) {
        if (mod && e.key.toLowerCase() === "d" && !e.shiftKey) {
          e.preventDefault();
          const b = editor.getTextCursorPosition().block;
          editor.insertBlocks([fresh(b)], b, "after");
        } else if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          if (e.key === "ArrowUp") editor.moveBlocksUp();
          else editor.moveBlocksDown();
        }
        return;
      }

      if (!selected.current.length) return;
      const list = blocks();
      if (e.key === "Escape") return clear();
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        const next = editor.getNextBlock?.(list.at(-1)) ?? editor.getPrevBlock?.(list[0]);
        editor.removeBlocks(list);
        clear();
        if (next && editor.getBlock(next.id)) {
          try {
            editor.setTextCursorPosition(next, "start");
            editor.focus();
          } catch {}
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const copies = editor.insertBlocks(list.map(fresh), list.at(-1), "after");
        paint(copies.map((b: { id: string }) => b.id));
        return;
      }
      if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const ids = selected.current;
        const all = editor.document.map((b: { id: string }) => b.id);
        const first = all.indexOf(ids[0]), lastI = all.indexOf(ids.at(-1));
        if (e.key === "ArrowUp" && first > 0) {
          const above = editor.getBlock(all[first - 1]);
          editor.removeBlocks([above]);
          editor.insertBlocks([fresh(above)], list.at(-1), "after");
        } else if (e.key === "ArrowDown" && lastI < all.length - 1) {
          const below = editor.getBlock(all[lastI + 1]);
          editor.removeBlocks([below]);
          editor.insertBlocks([fresh(below)], list[0], "before");
        }
        paint(ids);
        return;
      }
      if (e.key === "Enter") {
        // back to typing at the end of the selection
        e.preventDefault();
        const b = list.at(-1);
        clear();
        try {
          editor.setTextCursorPosition(b, "end");
          editor.focus();
        } catch {}
        return;
      }
      // any other typing lets go
      if (!mod && e.key.length === 1) clear();
    }

    // Ctrl+C / Ctrl+X on selected blocks: copy them as rich text and Markdown
    function copy(e: ClipboardEvent, cut: boolean) {
      if (!selected.current.length || !e.clipboardData) return;
      const list = blocks();
      e.preventDefault();
      e.clipboardData.setData("text/html", editor.blocksToHTMLLossy(list));
      e.clipboardData.setData("text/plain", editor.blocksToMarkdownLossy(list));
      if (cut) {
        editor.removeBlocks(list);
        clear();
      }
    }
    const onCopy = (e: ClipboardEvent) => copy(e, false);
    const onCut = (e: ClipboardEvent) => copy(e, true);
    const onFocusIn = (e: FocusEvent) => root()?.contains(e.target as Node) && clear();

    window.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", key, true);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      box?.remove();
      style.remove();
      document.body.classList.remove("blocks-selected");
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", key, true);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [editor]);

  return null;
}
