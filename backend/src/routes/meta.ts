import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { requireOwner, type AuthVars } from "../auth.js";

// Link previews for embed blocks: title, description and image of a web page.
const meta = new Hono<{ Variables: AuthVars }>();
meta.use("*", requireOwner);

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) return ip === "::1" || /^f[cd]|^fe80/i.test(ip) || ip.startsWith("::ffff:") && isPrivate(ip.slice(7));
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function pick(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() || undefined;
}

const tag = (prop: string) =>
  new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");

function metaTag(html: string, prop: string) {
  const m = html.match(tag(prop));
  return pick(m ? `"${m[1] ?? m[2]}"` : "", /"(.*)"/);
}

meta.get("/", async (c) => {
  let url: URL;
  try {
    url = new URL(c.req.query("url") ?? "");
  } catch {
    throw new HTTPException(400, { message: "Bad link" });
  }
  if (!/^https?:$/.test(url.protocol)) throw new HTTPException(400, { message: "Bad link" });
  const { address } = await lookup(url.hostname).catch(() => ({ address: "" }));
  if (!address || isPrivate(address)) throw new HTTPException(400, { message: "Can't preview that link" });

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NotesPreview/1.0)", Accept: "text/html" },
    });
    const html = (await res.text()).slice(0, 300_000);
    const image = metaTag(html, "og:image") ?? metaTag(html, "twitter:image");
    return c.json({
      title: metaTag(html, "og:title") ?? pick(html, /<title[^>]*>([^<]*)<\/title>/i) ?? url.hostname,
      description: metaTag(html, "og:description") ?? metaTag(html, "description") ?? "",
      image: image ? new URL(image, res.url).toString() : "",
      site: url.hostname.replace(/^www\./, ""),
    });
  } catch {
    return c.json({ title: url.hostname, description: "", image: "", site: url.hostname.replace(/^www\./, "") });
  }
});

export default meta;
