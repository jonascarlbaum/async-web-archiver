// urlUtils.js
import path from 'path';
import crypto from 'crypto';

export function isInternalUrl(url, host) {
  try {
    if (url.startsWith('/')) return true;
    if (!/^https?:/.test(url)) return true;
    const u = new URL(url);
    return u.hostname === host;
  } catch { return false; }
}

export function normalizeUrl(url, base) {
  try {
    return new URL(url, base).toString().replace(/#.*$/, '');
  } catch { return url; }
}

export function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch { return url; }
}

export function getLocalAssetPath(url) {
  try {
    const u = new URL(url);
    let pathname = u.pathname.replace(/\/+/g, '/').replace(/^\//, '');
    let ext = path.extname(pathname);
    if (!ext) {
      return path.join('ski-output', pathname + '.html');
    } else {
      return path.join('ski-output', pathname);
    }
  } catch { return null; }
}

export function getRelativeAssetPath(fromPath, toPath) {
  let rel = path.relative(path.dirname(fromPath), toPath).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

export function urlToFilename(url) {
  const hash = crypto.createHash('sha1').update(url).digest('hex');
  return `${hash}.html`;
}
