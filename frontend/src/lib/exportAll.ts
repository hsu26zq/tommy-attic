"use client";
import JSZip from "jszip";
import { api } from "./api";
import { resolveFileUrl } from "./files";

// "Export everything": one zip with every page as a Markdown file, folders like the sidebar,
// databases as CSV files, and your uploaded files (images, PDFs) next to them. Opens in Obsidian, VS Code, anything.
type N = { id: string; title: string; icon: string | null; parent_id: string | null; database_id: string | null; properties: Record<string, unknown>; markdown: string };
type D = { id: string; note_id: string; columns: { id: string; name: string }[] };

const clean = (s: string) => (s || "Untitled").replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
const csvCell = (v: unknown) => {
  const s = v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportEverything(onStep?: (msg: string) => void) {
  onStep?.("Gathering pages…");
  const { notes, databases } = await api<{ notes: N[]; databases: D[] }>("/notes/export");
  const zip = new JSZip();
  const root = zip.folder("Notes")!;
  const files = new Map<string, string>(); // sb://files/x -> files/x

  // unique names per folder
  const taken = new Map<string, Set<string>>();
  const nameIn = (folder: string, base: string) => {
    const set = taken.get(folder) ?? new Set<string>();
    taken.set(folder, set);
    let name = base, i = 2;
    while (set.has(name.toLowerCase())) name = `${base} ${i++}`;
    set.add(name.toLowerCase());
    return name;
  };

  const kids = new Map<string | null, N[]>();
  for (const n of notes) if (!n.database_id) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n]);
  const rowsOf = (dbId: string) => notes.filter((n) => n.database_id === dbId);
  const dbByNote = new Map<string, D[]>();
  for (const d of databases) dbByNote.set(d.note_id, [...(dbByNote.get(d.note_id) ?? []), d]);

  const linkFiles = (md: string, depth: number) =>
    md.replace(/sb:\/\/files\/([^\s)"']+)/g, (_, p) => {
      files.set(`sb://files/${p}`, `files/${p}`);
      return `${"../".repeat(depth)}files/${p}`;
    });

  function writePage(n: N, folder: string, depth: number) {
    const name = nameIn(folder, clean(n.title));
    const title = `# ${n.icon ? `${n.icon} ` : ""}${n.title || "Untitled"}\n\n`;
    root.file(`${folder}${name}.md`, title + linkFiles(n.markdown ?? "", depth));
    const children = kids.get(n.id) ?? [];
    const dbs = dbByNote.get(n.id) ?? [];
    if (!children.length && !dbs.length) return;
    const sub = `${folder}${name}/`;
    for (const c of children) writePage(c, sub, depth + 1);
    for (const d of dbs) {
      const rows = rowsOf(d.id);
      const csvName = nameIn(sub, `${clean(n.title)} table`);
      const header = ["Name", ...d.columns.map((c) => c.name)];
      const lines = rows.map((r) => [r.title, ...d.columns.map((c) => r.properties?.[c.id])].map(csvCell).join(","));
      root.file(`${sub}${csvName}.csv`, [header.map(csvCell).join(","), ...lines].join("\n"));
      const rowFolder = `${sub}${csvName}/`;
      for (const r of rows) if ((r.markdown ?? "").trim()) root.file(`${rowFolder}${nameIn(rowFolder, clean(r.title))}.md`, `# ${r.title || "Untitled"}\n\n${linkFiles(r.markdown, depth + 2)}`);
    }
  }
  for (const n of kids.get(null) ?? []) writePage(n, "", 0);

  // uploaded files
  let done = 0;
  for (const [src, dest] of files) {
    onStep?.(`Downloading files… ${++done}/${files.size}`);
    try {
      const res = await fetch(await resolveFileUrl(src));
      if (res.ok) root.file(dest, await res.blob());
    } catch {}
  }

  onStep?.("Zipping…");
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `notes-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
