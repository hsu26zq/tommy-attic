"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as WebAuthn from "@simplewebauthn/browser";
import { api, type Device } from "@/lib/api";
import { isTrustedHere, setTrustedHere, supabase } from "@/lib/supabase";
import { Topbar } from "@/components/workspace/Workspace";

type PasskeyApi = {
  startRegistration: () => Promise<{ data: { options: unknown; challenge_id: string } | null; error: Error | null }>;
  verifyRegistration: (a: { challengeId: string; credential: unknown }) => Promise<{ error: Error | null }>;
  list: () => Promise<{ data: { id: string; friendly_name?: string; created_at?: string; last_used_at?: string }[] | null; error: Error | null }>;
  delete: (a: { passkeyId: string }) => Promise<{ error: Error | null }>;
};
const passkeyApi = () => (supabase().auth as unknown as { passkey: PasskeyApi }).passkey;

function guessName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Mac/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows PC" : "Computer";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${os} · ${browser}`;
}

export default function Settings() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<{ id: string; friendly_name?: string; created_at?: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ devices: Device[]; currentId: string | null }>("/devices");
      setDevices(r.devices);
      setCurrentId(r.currentId);
      const me = r.devices.find((d) => d.id === r.currentId);
      if (!!me?.approved !== isTrustedHere()) setTrustedHere(!!me?.approved);
    } catch (e) {
      setErr((e as Error).message);
    }
    try {
      const { data } = await passkeyApi().list();
      setPasskeys(data ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While this device waits for approval, check every few seconds
  const me = devices.find((d) => d.id === currentId);
  useEffect(() => {
    if (!me || me.approved) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [me, load]);

  async function addPasskey() {
    setErr("");
    setMsg("");
    try {
      const { data, error } = await passkeyApi().startRegistration();
      if (error || !data) throw error ?? new Error("Could not start");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const credential = await WebAuthn.startRegistration({ optionsJSON: data.options as any });
      const { error: vErr } = await passkeyApi().verifyRegistration({ challengeId: data.challenge_id, credential });
      if (vErr) throw vErr;
      setMsg("Passkey added. You can now log in with Face ID / Touch ID.");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function removePasskey(id: string) {
    if (!confirm("Remove this passkey?")) return;
    await passkeyApi().delete({ passkeyId: id });
    load();
  }

  async function trustThisDevice() {
    setErr("");
    try {
      await api("/devices/register", { method: "POST", body: JSON.stringify({ name: guessName() }) });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }


  async function rename(d: Device) {
    const name = prompt("Device name", d.name);
    if (!name) return;
    await api(`/devices/${d.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    load();
  }

  async function remove(d: Device) {
    if (!confirm(`Remove "${d.name}" from trusted devices?`)) return;
    await api(`/devices/${d.id}`, { method: "DELETE" });
    if (d.id === currentId) setTrustedHere(false);
    load();
  }


  async function logoutEverywhere() {
    if (!confirm("Log out on every device, including this one?")) return;
    await supabase().auth.signOut({ scope: "global" });
    setTrustedHere(false);
    router.replace("/login");
  }

  const fmt = (s?: string) => (s ? new Date(s).toLocaleString() : "");

  return (
    <>
      <Topbar crumbs={<span className="crumb current">Settings</span>} />
      <div className="page">
        <h1 className="page-heading">Settings</h1>
        {msg && <p className="ok small">{msg}</p>}
        {err && <p className="error small">{err}</p>}

        <section className="section">
          <h2>This device</h2>
          {!me && (
            <div className="row-between">
              <p className="muted">Not trusted: you&apos;re logged out when the browser closes or after 30 minutes idle.</p>
              <button className="btn small" onClick={trustThisDevice}>Trust this device</button>
            </div>
          )}
          {me && me.approved && <p><b>{me.name}</b> is trusted. You stay logged in here.</p>}
          {me && !me.approved && (
            <>
              <p className="muted">Waiting for approval. In Supabase: <b>Table Editor → devices</b> → find this code → set <code>approved</code> to <b>true</b>.</p>
              <p className="code">{me.pair_code}</p>
            </>
          )}
        </section>

        <section className="section">
          <h2>Devices</h2>
          {!devices.length && <p className="muted">No devices yet.</p>}
          <ul className="list">
            {devices.map((d) => (
              <li key={d.id}>
                <span className="list-main">
                  {d.name} {d.id === currentId && <span className="muted small">· this device</span>}
                  <span className="muted small block">{d.approved ? "Trusted" : `Pending · ${d.pair_code}`} · last seen {fmt(d.last_seen_at)}</span>
                </span>
                <button className="text-btn" onClick={() => rename(d)}>Rename</button>
                <button className="text-btn danger" onClick={() => remove(d)}>Remove</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="section">
          <h2>Face ID</h2>
          <p className="muted small">The passkey on your iPhone is what approves every login.</p>
          <ul className="list">
            {passkeys.map((p) => (
              <li key={p.id}>
                <span className="list-main">{p.friendly_name || "Passkey"} <span className="muted small">· added {fmt(p.created_at)}</span></span>
                <button className="text-btn danger" onClick={() => removePasskey(p.id)}>Remove</button>
              </li>
            ))}
          </ul>
          <button className="btn small secondary" onClick={addPasskey}>Add a passkey on this device</button>
        </section>

        <section className="section">
          <h2>Safety</h2>
          <div className="row-between">
            <p className="muted">End every login on every device.</p>
            <button className="btn small danger" onClick={logoutEverywhere}>Log out everywhere</button>
          </div>
        </section>
      </div>
    </>
  );
}
