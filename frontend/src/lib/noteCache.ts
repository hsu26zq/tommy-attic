"use client";
import { api, type Note } from "./api";

// Pages kept in memory while the site is open, so going back to a page (or one you hovered) is instant.
const cache = new Map<string, Note>();
const inflight = new Map<string, Promise<Note>>();

export const cachedNote = (id: string) => cache.get(id);

export function fetchNote(id: string): Promise<Note> {
  const running = inflight.get(id);
  if (running) return running;
  const p = api<Note>(`/notes/${id}`)
    .then((n) => {
      cache.set(id, n);
      return n;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

// Remember edits so the cached copy stays current
export function updateCached(id: string, changes: Partial<Note>) {
  const n = cache.get(id);
  if (n) cache.set(id, { ...n, ...changes });
}

export const forgetNote = (id: string) => cache.delete(id);

// Start loading a page when the mouse rests on its link
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
export function prefetchNote(id: string) {
  if (cache.has(id) || inflight.has(id)) return;
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => fetchNote(id).catch(() => {}), 120);
}
export const cancelPrefetch = () => hoverTimer && clearTimeout(hoverTimer);
