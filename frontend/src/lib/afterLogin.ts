"use client";
import { api, type Device } from "./api";
import { setTrustedHere } from "./supabase";

// Runs right after any login: checks whether this browser is a trusted device,
// puts the session in the right place, and tells the backend (which sends an
// alert email when the device isn't trusted).
export async function afterLogin(method: string) {
  let trusted = false;
  try {
    const { device } = await api<{ device: Device | null }>("/devices/me");
    trusted = !!device?.approved;
  } catch {}
  setTrustedHere(trusted);
  try {
    await api("/devices/login-event", { method: "POST", body: JSON.stringify({ method }) });
  } catch {}
  return trusted;
}
