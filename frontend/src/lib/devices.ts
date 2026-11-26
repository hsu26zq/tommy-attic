"use client";
import { api, type Device } from "./api";
import { setTrustedHere } from "./supabase";

function deviceName() {
  const ua = navigator.userAgent;
  // iPads say they're Macs; a touch screen gives them away
  const ipad = /iPad/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
  const os = /iPhone/.test(ua) ? "iPhone" : ipad ? "iPad" : /Mac/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows PC" : "Computer";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${os} · ${browser}`;
}

// Every browser registers itself quietly. You approve it in Supabase (devices → approved = true);
// approved browsers stay logged in, the rest log out when closed or after 30 minutes idle.
// One check at a time: two at once used to register the same browser twice.
let checking: Promise<boolean> | null = null;
export function checkDevice(): Promise<boolean> {
  checking ??= runCheck().finally(() => setTimeout(() => (checking = null), 10_000));
  return checking;
}

async function runCheck(): Promise<boolean> {
  try {
    let { device } = await api<{ device: Device | null }>("/devices/me");
    if (!device) ({ device } = await api<{ device: Device }>("/devices/register", { method: "POST", body: JSON.stringify({ name: deviceName() }) }));
    setTrustedHere(!!device?.approved);
    return !!device?.approved;
  } catch {
    return false;
  }
}

// After any login: place the session correctly, then send the login email.
export async function afterLogin(method: string) {
  await checkDevice();
  try {
    await api("/devices/login-event", { method: "POST", body: JSON.stringify({ method }) });
  } catch {}
}
