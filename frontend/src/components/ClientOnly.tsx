"use client";
import dynamic from "next/dynamic";

// BlockNote runs only in the browser, so these load client-side.
export const ViewerClient = dynamic(() => import("./Viewer"), {
  ssr: false,
  loading: () => <p className="muted">Loading…</p>,
});

export const EditorClient = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => <p className="muted">Loading editor…</p>,
});
