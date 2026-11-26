"use client";
import { supabase } from "./supabase";

// Calls the backend (Render) through this site's /api path, with the login token attached.
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error ?? `Request failed (${res.status})`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export type NoteSummary = {
  id: string;
  title: string;
  type: "note" | "post";
  is_public: boolean;
  slug: string | null;
  updated_at: string;
  published_at: string | null;
};

export type Note = NoteSummary & { content: unknown[]; markdown: string; created_at: string };

export type Device = {
  id: string;
  name: string;
  approved: boolean;
  pair_code: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
};
