"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, type NoteSummary } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { onNotesChanged } from "@/lib/notesEvents";
import { checkDevice } from "@/lib/devices";
import Sidebar from "./Sidebar";
import SearchDialog from "./SearchDialog";
import { PanelIcon } from "./icons";

type Ctx = { notes: NoteSummary[] | null; openSidebar: () => void; hidden: boolean; setHidden: (h: boolean) => void };
const WorkspaceCtx = createContext<Ctx>({ notes: null, openSidebar: () => {}, hidden: false, setHidden: () => {} });
const HIDDEN_KEY = "ta_side_hidden";
export const useWorkspace = () => useContext(WorkspaceCtx);

export default function Workspace({ children }: { children: ReactNode }) {
  const { session, ready } = useSession();
  const router = useRouter();
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const [hidden, setHiddenState] = useState(false);
  const setHidden = useCallback((h: boolean) => {
    setHiddenState(h);
    try {
      localStorage.setItem(HIDDEN_KEY, h ? "1" : "");
    } catch {}
  }, []);

  // Remember whether the sidebar was hidden; Ctrl/⌘ + \ hides or shows it
  useEffect(() => {
    try {
      setHiddenState(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {}
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setHidden(!hidden);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [hidden, setHidden]);

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
    checkDevice();
    load();
    return onNotesChanged(load);
  }, [session, load]);

  if (!ready || !session) return null;

  return (
    <WorkspaceCtx.Provider value={{ notes, openSidebar: () => setSideOpen(true), hidden, setHidden }}>
      <div className={`app ${hidden ? "side-hidden" : ""}`}>
        <div className="side-peek" aria-hidden />
        <Sidebar notes={notes} open={sideOpen} onClose={() => setSideOpen(false)} onHide={() => setHidden(true)} />
        <main className="main">
          {error && <div className="banner">{error}</div>}
          {children}
        </main>
      </div>
      <SearchDialog />
    </WorkspaceCtx.Provider>
  );
}

// The thin bar at the top of each page: sidebar button (when hidden, or on phones), breadcrumbs, actions on the right.
export function Topbar({ crumbs, children }: { crumbs?: ReactNode; children?: ReactNode }) {
  const { openSidebar, hidden, setHidden } = useWorkspace();
  return (
    <div className="topbar">
      <button className="icon-btn menu-btn" onClick={openSidebar} aria-label="Show sidebar"><PanelIcon /></button>
      {hidden && <button className="icon-btn show-side" onClick={() => setHidden(false)} title={"Show sidebar (Ctrl+\\)"}><PanelIcon /></button>}
      <div className="crumbs">{crumbs}</div>
      <div className="top-actions">{children}</div>
    </div>
  );
}
