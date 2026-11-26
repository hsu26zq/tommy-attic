"use client";
import { supabase } from "./supabase";

// Files live in the private Supabase "files" bucket. Notes store "sb://files/<path>",
// and a short-lived link is created whenever a file is shown.
const PREFIX = "sb://files/";

async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

export async function uploadFile(original: File): Promise<string> {
  const file = await shrinkImage(original);
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
  const path = `${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase().storage.from("files").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message.includes("exceeded") ? "File is over the 50 MB limit" : error.message);
  return PREFIX + path;
}

export async function resolveFileUrl(url: string): Promise<string> {
  if (!url.startsWith(PREFIX)) return url;
  const { data, error } = await supabase().storage.from("files").createSignedUrl(url.slice(PREFIX.length), 60 * 60);
  if (error || !data) return url;
  return data.signedUrl;
}
