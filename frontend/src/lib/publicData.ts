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
  slug: string;
  content: unknown[];
  markdown: string;
  published_at: string;
  updated_at: string;
};

export async function listPublic(limit = 100) {
  const { data } = await db()
    .from("notes")
    .select("id,title,slug,markdown,published_at,updated_at")
    .eq("is_public", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Omit<PublicNote, "content">[];
}

export async function getPublic(slug: string) {
  const { data } = await db().from("notes").select("*").eq("is_public", true).eq("slug", slug).maybeSingle();
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
