const FALLBACK = "/";

/** Returns `next` only if it is a same-site relative path; otherwise "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return FALLBACK;
  // Backslashes and control characters are treated as slashes or stripped by browsers.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return FALLBACK;
  try {
    const base = "http://same-site.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return FALLBACK;
    // Dot-segment normalization (/.//x, /%2e//x, /a/..//x) can yield a protocol-relative path.
    if (url.pathname.startsWith("//")) return FALLBACK;
    return url.pathname + url.search + url.hash;
  } catch {
    return FALLBACK;
  }
}
