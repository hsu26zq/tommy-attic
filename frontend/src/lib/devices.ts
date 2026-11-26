"use client";
import { api, type Device } from "./api";
import { setTrustedHere } from "./supabase";

function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Mac/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows PC" : "Computer";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${os} · ${browser}`;
}

// Every browser registers itself quietly. You approve it in Supabase (devices → approved = true);
// approved browsers stay logged in, the rest log out when closed or after 30 minutes idle.
export async function checkDevice(): Promise<boolean> {
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
