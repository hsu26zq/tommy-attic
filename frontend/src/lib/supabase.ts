"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Where the login session is kept depends on whether this device is trusted:
//  - trusted device  → localStorage   (stays logged in)
//  - anything else   → sessionStorage (gone when the browser closes)
// Unknown devices start in the safe mode automatically. There's no checkbox to misclick.
const TRUST_FLAG = "ta_trusted";

export function isTrustedHere(): boolean {
  try {
    return localStorage.getItem(TRUST_FLAG) === "1";
  } catch {
    return false;
  }
}

const smartStorage = {
  getItem: (key: string) => {
    try {
      return (isTrustedHere() ? localStorage : sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      (isTrustedHere() ? localStorage : sessionStorage).setItem(key, value);
    } catch {}
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {}
  },
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_KEY!, {
      auth: {
        storage: smartStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        experimental: { passkey: true },
      },
    });
  }
  return client;
}

// Move the current session between storages when trust changes.
export function setTrustedHere(trusted: boolean) {
  try {
    const moving: [string, string][] = [];
    const from = trusted ? sessionStorage : localStorage;
    for (let i = 0; i < from.length; i++) {
      const k = from.key(i)!;
      if (k.startsWith("sb-")) moving.push([k, from.getItem(k)!]);
    }
    if (trusted) localStorage.setItem(TRUST_FLAG, "1");
    else localStorage.removeItem(TRUST_FLAG);
    const to = trusted ? localStorage : sessionStorage;
    for (const [k, v] of moving) {
      to.setItem(k, v);
      from.removeItem(k);
    }
  } catch {}
}
