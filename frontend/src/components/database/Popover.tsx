"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Floats a small menu next to an element, above everything (tables clip their own contents).
export default function Popover({
  anchor,
  onClose,
  className,
  align = "left",
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  className?: string;
  align?: "left" | "right" | "over";
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = box.current?.offsetWidth ?? 220;
      const h = box.current?.offsetHeight ?? 200;
      let top = align === "over" ? r.top : r.bottom + 4;
      if (top + h > window.innerHeight - 8) top = Math.max(8, (align === "over" ? r.bottom : r.top - 4) - h);
      let left = align === "right" ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ top, left });
    };
    place();
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && onClose();
    const t = setTimeout(() => window.addEventListener("mousedown", away), 0);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", away);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, align, onClose]);

  if (!anchor) return null;
  return createPortal(
    <div
      ref={box}
      className={`popover ${className ?? ""}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
