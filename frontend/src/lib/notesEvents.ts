"use client";
// Tiny events so every part of the workspace stays in step without a big state library.
export const notesChanged = () => window.dispatchEvent(new Event("notes-changed"));
export const onNotesChanged = (fn: () => void) => {
  window.addEventListener("notes-changed", fn);
  return () => window.removeEventListener("notes-changed", fn);
};

export const openSearch = () => window.dispatchEvent(new Event("open-search"));
export const onOpenSearch = (fn: () => void) => {
  window.addEventListener("open-search", fn);
  return () => window.removeEventListener("open-search", fn);
};
