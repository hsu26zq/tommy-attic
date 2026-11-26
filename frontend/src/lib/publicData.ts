import { createClient } from "@supabase/supabase-js";

// Server-side reads for visitors. Uses the public key, so the database only returns
// notes marked public — private notes are invisible here no matter what.
function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_KEY!, {
    auth: { persistSession: false },
  });
}

export type PublicNote = {
  id: string;
  title: string;
  type: "note" | "post";
  slug: string;
  content: unknown[];
  markdown: string;
  published_at: string;
  updated_at: string;
};

const LIST = "id,title,type,slug,markdown,published_at,updated_at";

export async function listPublic(type?: "note" | "post", limit = 50) {
  let q = db().from("notes").select(LIST).eq("is_public", true).order("published_at", { ascending: false }).limit(limit);
  if (type) q = q.eq("type", type);
  const { data } = await q;
  return (data ?? []) as Omit<PublicNote, "content">[];
}

export async function getPublic(type: "note" | "post", slug: string) {
  const { data } = await db()
    .from("notes")
    .select("*")
    .eq("is_public", true)
    .eq("type", type)
    .eq("slug", slug)
    .maybeSingle();
  return data as PublicNote | null;
}

export function excerpt(markdown: string, len = 160) {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > len ? text.slice(0, len).trimEnd() + "…" : text;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
