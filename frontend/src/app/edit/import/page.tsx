"use client";
import dynamic from "next/dynamic";
import { Topbar } from "@/components/workspace/Workspace";

const NotionImport = dynamic(() => import("@/components/NotionImport"), { ssr: false });

export default function ImportPage() {
  return (
    <>
      <Topbar crumbs={<span className="crumb current">Import</span>} />
      <div className="page">
        <h1 className="page-heading">Import from Notion</h1>
        <NotionImport />
      </div>
    </>
  );
}
