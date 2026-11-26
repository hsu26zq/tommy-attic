"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type NoteSummary } from "@/lib/api";
import { notesChanged } from "@/lib/notesEvents";
import { Topbar } from "@/components/workspace/Workspace";

export default function EditHome() {
  const router = useRouter();
  const [mod, setMod] = useState("Ctrl ");
  useEffect(() => setMod(/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl "), []);
  async function create() {
    const note = await api<NoteSummary>("/notes", { method: "POST", body: "{}" });
    notesChanged();
    router.push(`/edit/${note.id}`);
  }
  return (
    <>
      <Topbar />
      <div className="empty-state">
        <p>Pick a page, or start a new one.</p>
        <button className="btn" onClick={create}>New page</button>
        <p className="muted small">Type <kbd>/</kbd> for blocks · <kbd>@</kbd> to link a note · <kbd>{mod}K</kbd> to search</p>
      </div>
    </>
  );
}
