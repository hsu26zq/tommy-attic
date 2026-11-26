"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { afterLogin } from "@/lib/afterLogin";

// Shows a QR code. Scan it with your logged-in iPhone, approve with Face ID, and this computer logs in.
export default function QrLogin({ onDone }: { onDone: () => void }) {
  const [svg, setSvg] = useState("");
  const [msg, setMsg] = useState("Preparing…");
  const [left, setLeft] = useState(0);
  const req = useRef<{ id: string; pollSecret: string; expiresAt: number } | null>(null);
  const finished = useRef(false);

  const start = useCallback(async () => {
    setSvg("");
    setMsg("Preparing… (up to a minute if the server was asleep)");
    try {
      const res = await fetch("/api/auth/qr/start", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't start");
      req.current = { id: body.id, pollSecret: body.pollSecret, expiresAt: new Date(body.expiresAt).getTime() };
      const url = `${window.location.origin}/approve?r=${body.id}`;
      setSvg(await QRCode.toString(url, { type: "svg", margin: 1, width: 220 }));
      setMsg("Scan with your iPhone camera");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  // Check every 2 seconds whether the phone approved
  useEffect(() => {
    const t = setInterval(async () => {
      const r = req.current;
      if (!r || finished.current) return;
      setLeft(Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000)));
      try {
        const res = await fetch("/api/auth/qr/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, pollSecret: r.pollSecret }) });
        const body = await res.json();
        if (body.status === "expired") {
          req.current = null;
          start();
        } else if (body.status === "approved") {
          finished.current = true;
          setMsg("Approved. Logging in…");
          const { error } = await supabase().auth.verifyOtp({ token_hash: body.tokenHash, type: "magiclink" });
          if (error) {
            setMsg(error.message);
            return;
          }
          void afterLogin("qr-phone");
          onDone();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [start, onDone]);

  return (
    <div className="qr-box">
      {svg ? <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="qr qr-empty" />}
      <p className="small">{msg}</p>
      {svg && left > 0 && <p className="muted small">Expires in {left}s · then refreshes</p>}
    </div>
  );
}
