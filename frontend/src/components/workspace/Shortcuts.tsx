"use client";
import { useEffect, useState } from "react";

// Ctrl + / (⌘ + / on a Mac): a quiet list of every shortcut. Esc or a click closes it.
const LIST: [string, string][] = [
  ["Search", "Ctrl K"],
  ["Hide / show sidebar", "Ctrl \\"],
  ["Blocks menu", "/"],
  ["Link a page or add a date", "@"],
  ["Select the block you're in", "Esc"],
  ["Select several blocks", "drag in the empty space"],
  ["Duplicate block", "Ctrl D"],
  ["Move block up / down", "Ctrl Shift ↑ / ↓"],
  ["Delete selected blocks", "Delete"],
  ["Indent / outdent", "Tab / Shift Tab"],
  ["Bold · Italic · Underline", "Ctrl B · I · U"],
  ["Heading 1 · 2 · 3", "Ctrl Alt 1 · 2 · 3"],
  ["Undo · Redo", "Ctrl Z · Ctrl Shift Z"],
  ["Jump from title to text", "Enter"],
];

export default function Shortcuts() {
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  if (!open) return null;
  const fix = (k: string) => (mac ? k.replace(/Ctrl/g, "⌘").replace(/Alt/g, "⌥").replace(/Shift/g, "⇧") : k);
  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-title">Shortcuts</div>
        {LIST.map(([what, keys]) => (
          <div key={what} className="shortcut-row">
            <span>{what}</span>
            <kbd>{fix(keys)}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
