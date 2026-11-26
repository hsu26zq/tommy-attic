"use client";
// Tiny event so the sidebar refreshes when a note is created, renamed or deleted.
export const notesChanged = () => window.dispatchEvent(new Event("notes-changed"));
export const onNotesChanged = (fn: () => void) => {
  window.addEventListener("notes-changed", fn);
  return () => window.removeEventListener("notes-changed", fn);
};
