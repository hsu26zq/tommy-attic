"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isTrustedHere, supabase } from "./supabase";

const IDLE_LIMIT_MS = 30 * 60 * 1000; // public computers: log out after 30 minutes idle

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Idle logout on devices that aren't trusted
  useEffect(() => {
    if (!session || isTrustedHere()) return;
    let timer = setTimeout(logout, IDLE_LIMIT_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, IDLE_LIMIT_MS);
    };
    function logout() {
      supabase().auth.signOut({ scope: "local" }).then(() => (window.location.href = "/login?idle=1"));
    }
    const events = ["mousemove", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session]);

  return { session, ready };
}
