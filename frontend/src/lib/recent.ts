"use client";
// Pages you opened lately (kept on this device), shown in search before you type.
const KEY = "ta_recent";
const MAX = 8;

export function rememberOpened(id: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    localStorage.setItem(KEY, JSON.stringify([id, ...list.filter((x) => x !== id)].slice(0, MAX)));
  } catch {}
}

export function recentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
