"use client";
import { useEffect, useState } from "react";
import * as WebAuthn from "@simplewebauthn/browser";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";

type PasskeyApi = {
  startAuthentication: () => Promise<{ data: { options: unknown; challenge_id: string } | null; error: Error | null }>;
  verifyAuthentication: (a: { challengeId: string; credential: unknown }) => Promise<{ error: Error | null }>;
};

type Req = { id: string; status: string; user_agent: string | null; ip: string | null; created_at: string; expires_at: string };

function describe(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Mac/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows PC" : /Linux/.test(ua) ? "Linux PC" : "Computer";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${os} · ${br}`;
}

// Opened on your iPhone after scanning the QR code shown on a computer.
export default function Approve() {
  const { session, ready } = useSession();
  const [id, setId] = useState("");
  const [req, setReq] = useState<Req | null>(null);
  const [state, setState] = useState<"loading" | "ask" | "working" | "done" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => setId(new URLSearchParams(window.location.search).get("r") ?? ""), []);

  useEffect(() => {
    if (!ready || !session || !id) return;
    api<Req>(`/auth/qr/${id}`)
      .then((r) => {
        setReq(r);
        if (r.status !== "pending") throw new Error("This QR code was already used.");
        if (new Date(r.expires_at) < new Date()) throw new Error("This QR code expired. Refresh it on the computer.");
        setState("ask");
      })
      .catch((e) => {
        setError((e as Error).message);
        setState("error");
      });
  }, [ready, session, id]);

  async function approve() {
    setState("working");
    setError("");
    try {
      // Face ID check on this phone (passkey stored on the phone, no Bluetooth)
      const passkey = (supabase().auth as unknown as { passkey: PasskeyApi }).passkey;
      const { data, error: startErr } = await passkey.startAuthentication();
      if (startErr || !data) throw startErr ?? new Error("Couldn't start Face ID");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const credential = await WebAuthn.startAuthentication({ optionsJSON: data.options as any });
      const { error: vErr } = await passkey.verifyAuthentication({ challengeId: data.challenge_id, credential });
      if (vErr) throw vErr;
      await api(`/auth/qr/${id}/approve`, { method: "POST" });
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("ask");
    }
  }

  if (!ready) return null;

  if (!session) {
    const next = encodeURIComponent(`/approve?r=${id}`);
    return (
      <div className="auth-wrap">
        <div className="auth-box">
          <h1 style={{ marginTop: 0 }}>Approve login</h1>
          <p className="muted">Log in on this phone first, then the approval opens.</p>
          <a className="btn" href={`/login?next=${next}`}>Log in on this phone</a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-box" style={{ textAlign: "center" }}>
        {state === "loading" && <p className="muted">Loading…</p>}
        {state === "error" && (
          <>
            <h1 style={{ marginTop: 0 }}>Can&apos;t approve</h1>
            <p className="muted">{error}</p>
          </>
        )}
        {(state === "ask" || state === "working") && req && (
          <>
            <h1 style={{ marginTop: 0 }}>Log in on this device?</h1>
            <p style={{ fontSize: "1.1rem", margin: "4px 0" }}><b>{describe(req.user_agent)}</b></p>
            <p className="muted small">{req.ip ? `IP ${req.ip} · ` : ""}{new Date(req.created_at).toLocaleTimeString()}</p>
            <p className="muted small">Only approve if you&apos;re looking at that screen right now.</p>
            <button className="btn" onClick={approve} disabled={state === "working"} style={{ width: "100%", marginTop: 8 }}>
              {state === "working" ? "Confirming…" : "Approve with Face ID"}
            </button>
            <a className="btn secondary" href="/" style={{ width: "100%", marginTop: 8 }}>Deny</a>
            {error && <div className="notice">{error}</div>}
          </>
        )}
        {state === "done" && (
          <>
            <h1 style={{ marginTop: 0 }}>Done ✓</h1>
            <p className="muted">The computer is logging in now. You can close this.</p>
          </>
        )}
      </div>
    </div>
  );
}
