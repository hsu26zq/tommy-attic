"use client";
import { useState } from "react";
import JSZip from "jszip";
import { BlockNoteEditor } from "@blocknote/core";
import { api, type Column, type ColumnType, type Database } from "@/lib/api";
import { uploadFile } from "@/lib/files";
import { notesChanged } from "@/lib/notesEvents";
import { editorOptions } from "./editorSetup";

// Imports a Notion export (Settings → Export → "Markdown & CSV", include subpages).
// Pages keep their nesting, images are uploaded, links between pages keep working,
// and Notion databases (CSV) become databases here.

type Page = { key: string; title: string; mdPath: string | null; parentKey: string | null; dbKey: string | null };
type Db = { key: string; title: string; csvPath: string; hostKey: string | null };

const HASH = /^(.*?)\s+([0-9a-f]{32})$/i;
const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const cleanTitle = (name: string) => (name.match(HASH)?.[1] ?? name).trim() || "Untitled";

function joinPath(dir: string, rel: string) {
  const parts = (dir ? dir.split("/") : []).concat(rel.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function guessType(values: string[]): ColumnType {
  const v = values.map((x) => x.trim()).filter(Boolean);
  if (!v.length) return "text";
  if (v.every((x) => /^-?\d+(\.\d+)?$/.test(x))) return "number";
  if (v.every((x) => /^(yes|no)$/i.test(x))) return "checkbox";
  if (v.every((x) => /^https?:\/\//.test(x))) return "url";
  if (v.every((x) => /^[A-Z][a-z]+ \d{1,2}, \d{4}/.test(x) && !Number.isNaN(Date.parse(x)))) return "date";
  if (v.filter((x) => x.includes(", ")).length / v.length > 0.3 && v.every((x) => x.length < 80)) return "tags";
  return "text";
}

function convert(type: ColumnType, raw: string): unknown {
  const x = raw.trim();
  if (!x) return null;
  if (type === "number") return Number(x);
  if (type === "checkbox") return /^yes$/i.test(x);
  if (type === "tags") return x.split(",").map((s) => s.trim()).filter(Boolean);
  if (type === "date") return new Date(Date.parse(x)).toISOString().slice(0, 10);
  return x;
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf" };

export default function NotionImport() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const say = (s: string) => setLog((l) => [...l, s]);

  async function run(file: File) {
    setBusy(true);
    setLog([]);
    try {
      say(`Reading ${file.name}…`);
      let zip = await JSZip.loadAsync(file);
      // Notion sometimes wraps the export in another zip
      const inner = Object.values(zip.files).filter((f) => !f.dir && f.name.endsWith(".zip"));
      const files: Record<string, JSZip.JSZipObject> = {};
      if (inner.length && !Object.keys(zip.files).some((n) => n.endsWith(".md"))) {
        for (const z of inner) {
          const sub = await JSZip.loadAsync(await z.async("blob"));
          Object.values(sub.files).forEach((f) => !f.dir && (files[f.name.normalize("NFC")] = f));
        }
      } else {
        Object.values(zip.files).forEach((f) => !f.dir && (files[f.name.normalize("NFC")] = f));
      }
      zip = null as unknown as JSZip;

      const paths = Object.keys(files);
      const md = paths.filter((p) => p.endsWith(".md"));
      const csvs = paths.filter((p) => p.endsWith(".csv"));
      if (!md.length && !csvs.length) throw new Error("No Notion pages found. Export as \"Markdown & CSV\".");

      // Databases: prefer the "_all.csv" version when both exist
      const dbs = new Map<string, Db>();
      for (const p of csvs) {
        const key = p.slice(0, -4).replace(/_all$/, "");
        if (dbs.has(key) && !p.endsWith("_all.csv")) continue;
        dbs.set(key, { key, title: cleanTitle(basename(key)), csvPath: p, hostKey: null });
      }

      const pages = new Map<string, Page>();
      for (const p of md) {
        const key = p.slice(0, -3);
        const folder = dirname(p);
        pages.set(key, {
          key,
          title: cleanTitle(basename(key)),
          mdPath: p,
          parentKey: folder && md.includes(`${folder}.md`) ? folder : null,
          dbKey: dbs.has(folder) ? folder : null,
        });
      }
      // Each database lives in the page whose folder contains it; otherwise it gets its own page
      for (const db of dbs.values()) {
        const folder = dirname(db.csvPath);
        if (folder && pages.has(folder)) db.hostKey = folder;
        else {
          const hostKey = `${db.key}::host`;
          pages.set(hostKey, { key: hostKey, title: db.title, mdPath: null, parentKey: null, dbKey: null });
          db.hostKey = hostKey;
        }
      }

      // 1) Create pages, parents first
      const ids = new Map<string, string>();
      const plain = [...pages.values()].filter((p) => !p.dbKey).sort((a, b) => a.key.split("/").length - b.key.split("/").length);
      say(`Creating ${plain.length} pages…`);
      for (const p of plain) {
        const parent_id = p.parentKey ? ids.get(p.parentKey) ?? null : null;
        const n = await api<{ id: string }>("/notes", { method: "POST", body: JSON.stringify({ title: p.title, parent_id }) });
        ids.set(p.key, n.id);
      }

      // 2) Databases and their rows
      const dbBlocks = new Map<string, string[]>(); // host page key → database ids
      for (const db of dbs.values()) {
        const rows = parseCsv((await files[db.csvPath].async("string")).replace(/^﻿/, ""));
        if (!rows.length) continue;
        const [header, ...data] = rows;
        const columns: Column[] = header.slice(1).map((name, i) => ({
          id: `c${i}`,
          name: name || `Column ${i + 1}`,
          type: guessType(data.map((r) => r[i + 1] ?? "")),
        }));
        const created = await api<Database>("/databases", { method: "POST", body: JSON.stringify({ note_id: ids.get(db.hostKey!), columns }) });
        dbBlocks.set(db.hostKey!, [...(dbBlocks.get(db.hostKey!) ?? []), created.id]);
        say(`Database "${db.title}": ${data.length} rows`);
        const rowPages = [...pages.values()].filter((p) => p.dbKey === db.key);
        for (const r of data) {
          const title = r[0]?.trim() || "Untitled";
          const properties = Object.fromEntries(columns.map((c, i) => [c.id, convert(c.type, r[i + 1] ?? "")]));
          const n = await api<{ id: string }>("/notes", { method: "POST", body: JSON.stringify({ database_id: created.id, title, properties }) });
          const match = rowPages.find((p) => p.title === title && !ids.has(p.key));
          if (match) ids.set(match.key, n.id);
        }
      }

      // 3) Fill in content: upload images, fix links, convert Markdown to blocks
      const editor = BlockNoteEditor.create({ schema: editorOptions.schema });
      const all = [...pages.values()];
      say("Converting content…");
      let done = 0;
      for (const p of all) {
        const id = ids.get(p.key);
        if (!id) continue;
        let text = p.mdPath ? await files[p.mdPath].async("string") : "";
        const dir = p.mdPath ? dirname(p.mdPath) : "";
        // Drop the "# Title" line, and for database rows the property lines under it
        text = text.replace(/^﻿?#\s+[^\n]*\n+/, "");
        if (p.dbKey) text = text.replace(/^(?:[^\n:]{1,60}:[^\n]*\n)+\n*/, "");

        // Images and attached files
        const media = [...text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
        for (const m of media) {
          const src = m[2].split(" ")[0];
          if (/^https?:/.test(src)) continue;
          const path = joinPath(dir, decodeURIComponent(src)).normalize("NFC");
          const f = files[path];
          if (!f) continue;
          const ext = path.split(".").pop()!.toLowerCase();
          const url = await uploadFile(new File([await f.async("blob")], basename(path), { type: MIME[ext] ?? "application/octet-stream" }));
          text = text.split(m[2]).join(url);
        }
        // Links to other imported pages
        text = text.replace(/\]\(([^)]+\.md)\)/g, (all_, href: string) => {
          if (/^https?:/.test(href)) return all_;
          const key = joinPath(dir, decodeURIComponent(href)).normalize("NFC").slice(0, -3);
          const target = ids.get(key);
          return target ? `](/edit/${target})` : all_;
        });
        // Links to databases (csv) → just text
        text = text.replace(/\[([^\]]+)\]\([^)]+\.csv\)/g, "$1");

        const blocks = text.trim() ? (editor.tryParseMarkdownToBlocks(text) as unknown[]) : [];
        for (const dbId of dbBlocks.get(p.key) ?? []) blocks.push({ type: "database", props: { databaseId: dbId } });
        if (blocks.length) {
          await api(`/notes/${id}`, { method: "PATCH", body: JSON.stringify({ content: blocks, markdown: text }) });
        }
        done++;
        if (done % 10 === 0) say(`…${done}/${all.length}`);
      }
      notesChanged();
      say(`Done. Imported ${ids.size} pages and rows.`);
    } catch (e) {
      say(`Stopped: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import">
      <ol className="steps">
        <li>In Notion: <b>Settings → Export all workspace content</b> (or a page&apos;s <b>⋯ → Export</b>).</li>
        <li>Choose <b>Markdown &amp; CSV</b>, turn on <b>Include subpages</b> and <b>Create folders for subpages</b>.</li>
        <li>Pick the downloaded .zip below.</li>
      </ol>
      <label className={`drop ${busy ? "busy" : ""}`}>
        <input type="file" accept=".zip" disabled={busy} onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
        {busy ? "Importing…" : "Choose Notion export (.zip)"}
      </label>
      {log.length > 0 && (
        <pre className="log">{log.join("\n")}</pre>
      )}
    </div>
  );
}
