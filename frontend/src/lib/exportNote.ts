"use client";
import { api, type Note } from "./api";

// Download a page as a Markdown file.
export async function downloadMarkdown(id: string) {
  const note = await api<Note>(`/notes/${id}`);
  const name = (note.title || "Untitled").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Untitled";
  const blob = new Blob([`# ${note.title || "Untitled"}\n\n${note.markdown}`], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// A small message at the bottom of the screen that fades away by itself.
export function toast(message: string, action?: { label: string; run: () => void }) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label;
    b.onclick = () => {
      el.remove();
      action.run();
    };
    el.appendChild(b);
  }
  document.body.appendChild(el);
  const stay = action ? 5000 : 1600;
  setTimeout(() => el.classList.add("out"), stay);
  setTimeout(() => el.remove(), stay + 400);
}
