// crawlerUtils.js
export function inScope(url, ALLOWED_HOSTS) {
  try {
    const u = new URL(url);
    if (!ALLOWED_HOSTS.has(u.hostname)) return false;
    const excluded = ['/logout', '/signout'];
    if (excluded.some(p => u.pathname.startsWith(p))) return false;
    return true;
  } catch { return false; }
}
