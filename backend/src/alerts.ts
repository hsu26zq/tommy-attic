import { env } from "./env.js";

// Login alert emails. Does nothing until RESEND_API_KEY and ALERT_EMAIL are set.
export async function sendLoginAlert(info: { method: string; userAgent: string; ip: string }) {
  if (!env.resendKey || !env.alertEmail) {
    console.log("[alert] login from untrusted device (email not configured)", info);
    return;
  }
  const when = new Date().toUTCString();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.alertFrom,
      to: [env.alertEmail],
      subject: "New login to Tommy's Attic",
      text:
        `Someone logged in to your site from a device that isn't trusted.\n\n` +
        `When: ${when}\nMethod: ${info.method}\nBrowser: ${info.userAgent}\nIP: ${info.ip}\n\n` +
        `If this wasn't you, open Settings → Devices and click "Log out everywhere".`,
    }),
  });
  if (!res.ok) console.error("[alert] email failed", res.status, await res.text());
}
