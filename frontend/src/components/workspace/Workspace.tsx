"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, type NoteSummary } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { onNotesChanged } from "@/lib/notesEvents";
import Sidebar from "./Sidebar";
import SearchDialog from "./SearchDialog";

type Ctx = { notes: NoteSummary[] | null; openSidebar: () => void };
const WorkspaceCtx = createContext<Ctx>({ notes: null, openSidebar: () => {} });
export const useWorkspace = () => useContext(WorkspaceCtx);

export default function Workspace({ children }: { children: ReactNode }) {
  const { session, ready } = useSession();
  const router = useRouter();
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState("");
  const [sideOpen, setSideOpen] = useState(false);

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  const load = useCallback(async () => {
    try {
      setNotes(await api<NoteSummary[]>("/notes"));
      setError("");
    } catch (e) {
      setError((e as { status?: number }).status === 403 ? "This account isn't the owner." : (e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    load();
    return onNotesChanged(load);
  }, [session, load]);

  if (!ready || !session) return null;

  return (
    <WorkspaceCtx.Provider value={{ notes, openSidebar: () => setSideOpen(true) }}>
      <div className="app">
        <Sidebar notes={notes} open={sideOpen} onClose={() => setSideOpen(false)} />
        <main className="main">
          {error && <div className="banner">{error}</div>}
          {children}
        </main>
      </div>
      <SearchDialog />
    </WorkspaceCtx.Provider>
  );
}

// The thin bar at the top of each page: menu button (phones), breadcrumbs, and actions on the right.
export function Topbar({ crumbs, children }: { crumbs?: ReactNode; children?: ReactNode }) {
  const { openSidebar } = useWorkspace();
  return (
    <div className="topbar">
      <button className="icon-btn menu-btn" onClick={openSidebar} aria-label="Menu">☰</button>
      <div className="crumbs">{crumbs}</div>
      <div className="top-actions">{children}</div>
    </div>
  );
}
