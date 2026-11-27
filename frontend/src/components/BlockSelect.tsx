"use client";
import { useEffect, useRef } from "react";
import { useExtensionState } from "@blocknote/react";
import { SideMenuExtension, TableHandlesExtension } from "@blocknote/core/extensions";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Editor = any;

// Picking whole blocks without touching their text:
// - drag a box from the empty space around the page to select blocks
// - Esc while typing selects the block you're in
// - then Delete, Ctrl+C / Ctrl+X, Ctrl+D (duplicate), Ctrl+Shift+↑/↓ (move), or click anywhere to let go
// Also: a plain click below the last block starts a new line there.
// a columns row counts as one block
const TOP_BLOCKS = ".bn-editor > .bn-block-group > :is(.bn-block-outer, .bn-block-column-list)";
const NOT_START = ".bn-block-content, .bn-side-menu, .col-edge, .col-move, .tbl-edge, .db-edge, button, input, textarea, select, a, .page-title, .page-icon-row, .cover, .topbar, .backlinks, .popover, .context-menu, .bn-container [role=menu], .mantine-Popover-dropdown, .history";

export default function BlockSelect({ editor }: { editor: Editor }) {
  const selected = useRef<string[]>([]);
  // the block whose ⋮⋮ handle is showing (that's the one that gets dragged)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBlock = useExtensionState(SideMenuExtension as any, { editor, selector: (s: any) => s?.block?.id }) as string | undefined;
  const handleRef = useRef<string | undefined>(undefined);
  handleRef.current = handleBlock;

  useEffect(() => {
    const root = () => editor?.domElement as HTMLElement | undefined;
    const outers = () => Array.from(root()?.querySelectorAll<HTMLElement>(TOP_BLOCKS) ?? []);

    // The highlight is a style rule rather than a class: the editor redraws blocks and would wipe classes.
    const style = document.createElement("style");
    document.head.appendChild(style);
    function paint(ids: string[]) {
      selected.current = ids;
      // Each selected block gets its own rounded box, with a small gap between neighbours.
      // The box is drawn behind the block (a pseudo-element) so nothing on the page moves.
      const sel = (id: string, after = "") =>
        `.bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block${after}, .bn-block-column-list[data-id="${CSS.escape(id)}"] > .bn-block-column > .bn-block-outer > .bn-block${after}`; // a columns row: every block in every column gets its own box
      style.textContent = ids.length
        ? `${ids.map((id) => sel(id)).join(",")} { position: relative; isolation: isolate; }
${ids.map((id) => sel(id, "::before")).join(",")} { content: ""; position: absolute; inset: 2px -4px; border-radius: 5px; background: rgba(240,90,90,0.12); z-index: -1; pointer-events: none; }`
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
      // dragging the line between two columns is a resize, not a selection
      if (document.querySelector(".bn-column-resize-border")) return;
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

      // Ctrl+M merges the selected table cells, Ctrl+Shift+M splits one back
      // (a cell selection can leave focus on the page itself, so only skip when typing in some other field)
      const typingElsewhere = !inEditor && !!(document.activeElement as HTMLElement | null)?.closest?.("input, textarea, [contenteditable=true]");
      if (!typingElsewhere && e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "m") {
        const tables = editor.getExtension?.(TableHandlesExtension);
        let done = false;
        try {
          done = !!tables && (e.shiftKey ? tables.splitCell() : tables.mergeCells());
        } catch {}
        if (done) e.preventDefault();
        return;
      }

      // Esc while typing: select the block you're in
      if (e.key === "Escape" && inEditor && !selected.current.length) {
        if (document.querySelector(".bn-suggestion-menu, .mantine-Popover-dropdown")) return;
        const b = editor.getTextCursorPosition?.().block;
        if (!b) return;
        // only top-level blocks can be box-selected; climb to it
        let el = root()?.querySelector<HTMLElement>(`.bn-block-outer[data-id="${b.id}"]`);
        while (el && !el.matches(TOP_BLOCKS)) el = el.parentElement?.closest<HTMLElement>(".bn-block-outer, .bn-block-column-list") ?? null;
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

    // Dropping a dragged block below the last block puts it at the end of the page.
    // (Left alone, the editor drops it into the nearest block — inside the last column if the page ends in columns.)
    let dragged: string | null = null;
    function dragStart(e: DragEvent) {
      dragged = (e.target as HTMLElement)?.closest?.(".bn-side-menu") ? (handleRef.current ?? null) : null;
    }
    function belowLast(e: DragEvent) {
      const group = root()?.querySelector(":scope > .bn-block-group");
      if (!group || !(e.target as HTMLElement)?.closest?.(".main")) return false;
      const tops = Array.from(group.children).filter((el) => !el.classList.contains("bn-trailing-block"));
      const last = tops.at(-1) as HTMLElement | undefined;
      return !!last && e.clientY > last.getBoundingClientRect().bottom;
    }
    // anywhere below the last block accepts the drop
    function overBelow(e: DragEvent) {
      if (!dragged || !belowLast(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    }
    function dropBelow(e: DragEvent) {
      const id = dragged;
      dragged = null;
      if (!id || !belowLast(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const block = editor.getBlock(id);
      const end = editor.document.at(-1);
      if (block && end && end.id !== id) {
        editor.transact(() => {
          editor.removeBlocks([id]);
          editor.insertBlocks([block], editor.document.at(-1), "after");
        });
      }
      // finish the drag the way the editor would
      if (editor.prosemirrorView) editor.prosemirrorView.dragging = null;
      document.querySelectorAll(".bn-drag-preview").forEach((p) => p.remove());
    }
    // While a block is dragged, the blocks below the drop point slide down to open a gap (transform only).
    // Positions are read without the slide (offsetTop), so the gap never chases the cursor.
    const slide = document.createElement("style");
    document.head.appendChild(slide);
    let slideKey = "";
    function overSlide(e: DragEvent) {
      if (!dragged) return;
      const group = root()?.querySelector<HTMLElement>(":scope > .bn-block-group");
      const me = group?.querySelector<HTMLElement>(`:scope > [data-id="${CSS.escape(dragged)}"]`);
      if (!group || !me || !(e.target as HTMLElement)?.closest?.(".main")) return;
      const g = group.getBoundingClientRect().top;
      const top = (el: HTMLElement) => g + el.offsetTop - (el.offsetParent === group ? 0 : group.offsetTop);
      const list = outers().filter((el) => el !== me);
      const i = list.findIndex((el) => e.clientY < top(el) + el.offsetHeight / 2);
      const moved = i < 0 ? [] : list.slice(i);
      const key = moved.map((el) => el.dataset.id).join(",");
      if (key === slideKey) return;
      slideKey = key;
      const h = Math.min(me.offsetHeight, 160);
      slide.textContent =
        `.bn-editor > .bn-block-group > [data-id="${CSS.escape(dragged)}"] { opacity: 0.3; }` +
        (moved.length ? `${moved.map((el) => `.bn-editor > .bn-block-group > [data-id="${CSS.escape(el.dataset.id ?? "")}"]`).join(",")} { transform: translateY(${h}px); }` : "");
    }
    const endSlide = () => {
      slideKey = "";
      slide.textContent = "";
    };
    document.addEventListener("dragover", overSlide, true);
    document.addEventListener("drop", endSlide, true);
    document.addEventListener("dragend", endSlide, true);
    document.addEventListener("dragstart", dragStart, true);
    document.addEventListener("drop", dropBelow, true);
    document.addEventListener("dragover", overBelow, true);
    const dragDone = () => setTimeout(() => (dragged = null), 0);
    document.addEventListener("dragend", dragDone, true);

    // Double-click a table's column resize line: the column fits its longest line of text
    function autofit(e: MouseEvent) {
      if (!document.querySelector(".ProseMirror .column-resize-handle")) return;
      const cell = (e.target as HTMLElement | null)?.closest<HTMLElement>("td, th");
      const tableEl = cell?.closest("table");
      const outer = cell?.closest<HTMLElement>(".bn-block-outer[data-id]");
      if (!cell || !tableEl || !outer) return;
      // which column: the line is on the cell's right edge, or on its left edge (then it's the column before)
      const r = cell.getBoundingClientRect();
      const colOf = (c: HTMLElement) => [...(c.parentElement?.children ?? [])].slice(0, [...(c.parentElement?.children ?? [])].indexOf(c)).reduce((n, x) => n + ((x as HTMLTableCellElement).colSpan || 1), 0);
      const col = colOf(cell) + (e.clientX - r.left < r.right - e.clientX ? -1 : (cell as HTMLTableCellElement).colSpan - 1);
      if (col < 0) return;
      e.preventDefault();
      // measure each cell's text on one line: briefly lay the table's text out unwrapped (through a style rule)
      const probe = document.createElement("style");
      const scope = `.bn-block-outer[data-id="${CSS.escape(outer.dataset.id ?? "")}"] :is(td, th) :is(.bn-inline-content, p)`;
      probe.textContent = `${scope} { white-space: nowrap !important; width: max-content !important; display: inline-block !important; }`;
      let widest = 0;
      let pad = 0; // everything in a cell around its text (padding, inner spacing)
      for (const tr of tableEl.querySelectorAll("tr")) {
        for (const c of tr.children as unknown as HTMLElement[]) {
          if (colOf(c) !== col || ((c as HTMLTableCellElement).colSpan || 1) > 1) continue;
          const text = c.querySelector<HTMLElement>(".bn-inline-content, p") ?? c;
          pad = Math.max(pad, c.getBoundingClientRect().width - text.getBoundingClientRect().width);
        }
      }
      document.head.appendChild(probe);
      for (const tr of tableEl.querySelectorAll("tr")) {
        for (const c of tr.children as unknown as HTMLElement[]) {
          if (colOf(c) !== col || ((c as HTMLTableCellElement).colSpan || 1) > 1) continue;
          const text = c.querySelector<HTMLElement>(".bn-inline-content, p") ?? c;
          widest = Math.max(widest, text.getBoundingClientRect().width);
        }
      }
      probe.remove();
      const block = editor.getBlock(outer.dataset.id);
      if (!block || block.type !== "table") return;
      const widths = [...(block.content.columnWidths ?? [])];
      while (widths.length <= col) widths.push(undefined);
      widths[col] = Math.max(40, Math.ceil(widest + pad + 4));
      editor.updateBlock(block, { content: { ...block.content, columnWidths: widths } });
      window.getSelection()?.removeAllRanges();
    }
    document.addEventListener("dblclick", autofit, true);

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
      document.removeEventListener("dblclick", autofit, true);
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", key, true);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("dragstart", dragStart, true);
      document.removeEventListener("drop", dropBelow, true);
      document.removeEventListener("dragover", overBelow, true);
      document.removeEventListener("dragend", dragDone, true);
      document.removeEventListener("dragover", overSlide, true);
      document.removeEventListener("drop", endSlide, true);
      document.removeEventListener("dragend", endSlide, true);
      slide.remove();
    };
  }, [editor]);

  return null;
}
