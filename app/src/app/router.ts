import { useEffect, useState } from "react";

// Hash routing: works the same in the Tauri webview and in a browser, no dependency.
const current = () => location.hash.slice(1) || "/";

export function useRoute() {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const f = () => setPath(current());
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return path;
}

export const go = (path: string) => { location.hash = path; };

// match("/note/:id", "/note/abc") -> { id: "abc" }
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/"), a = path.split("/");
  if (p.length !== a.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) out[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return out;
}
