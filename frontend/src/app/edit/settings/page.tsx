"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as WebAuthn from "@simplewebauthn/browser";
import { api, type Device } from "@/lib/api";
import { isTrustedHere, setTrustedHere, supabase } from "@/lib/supabase";

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
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ marginTop: 0 }}>Settings &amp; devices</h1>
      {msg && <div className="notice ok">{msg}</div>}
      {err && <div className="notice">{err}</div>}

      <div className="card">
        <h2>This device</h2>
        {!me && (
          <>
            <p className="muted">This device isn&apos;t trusted, so you&apos;ll be logged out when the browser closes or after 30 minutes idle.</p>
            <button className="btn" onClick={trustThisDevice}>Trust this device</button>
          </>
        )}
        {me && me.approved && <p>✅ <b>{me.name}</b> is trusted. You stay logged in here.</p>}
        {me && !me.approved && (
          <>
            <p>Waiting for approval. In Supabase: <b>Table Editor → devices</b> → find this code → set <code>approved</code> to <b>true</b>.</p>
            <p className="code">{me.pair_code}</p>
          </>
        )}
      </div>

      <div className="card">
        <h2>Trusted devices</h2>
        {!devices.length && <p className="muted">No devices yet.</p>}
        <ul className="entry-list" style={{ margin: 0 }}>
          {devices.map((d) => (
            <li key={d.id} style={{ padding: "12px 4px" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <b>{d.name}</b> {d.id === currentId && <span className="badge">this device</span>}{" "}
                  <span className={`badge ${d.approved ? "public" : ""}`}>{d.approved ? "Trusted" : `Pending · ${d.pair_code}`}</span>
                  <div className="muted small">Last seen {fmt(d.last_seen_at)}</div>
                </div>
                <div className="row">
                  <button className="btn small secondary" onClick={() => rename(d)}>Rename</button>
                  <button className="btn small danger" onClick={() => remove(d)}>Remove</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Passkeys</h2>
        <p className="muted small">Passkeys let you log in with Face ID / Touch ID, or by scanning a QR code with your iPhone.</p>
        <ul className="entry-list" style={{ margin: "8px 0 16px" }}>
          {passkeys.map((p) => (
            <li key={p.id} style={{ padding: "10px 4px" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>{p.friendly_name || "Passkey"} <span className="muted small">added {fmt(p.created_at)}</span></span>
                <button className="btn small danger" onClick={() => removePasskey(p.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
        <button className="btn" onClick={addPasskey}>Add a passkey</button>
      </div>


      <div className="card">
        <h2>Safety</h2>
        <p className="muted small">Forgot to log out somewhere? This ends every login on every device.</p>
        <button className="btn danger" onClick={logoutEverywhere}>Log out everywhere</button>
      </div>
    </div>
  );
}
