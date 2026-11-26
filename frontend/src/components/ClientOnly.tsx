"use client";
import dynamic from "next/dynamic";

// BlockNote runs only in the browser, so these load client-side.
export const ViewerClient = dynamic(() => import("./Viewer"), {
  ssr: false,
  loading: () => null,
});

export const EditorClient = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => <div className="skel skel-line" />,
});
