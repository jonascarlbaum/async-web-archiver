// assetManager.js
import fs from 'fs';
import path from 'path';
import { getRelativeAssetPath } from './urlUtils.js';

export async function downloadAsset(assetUrl, assetUrlToLocal, OUT_DIR, assetUrlToPath, ALLOWED_HOSTS) {
  if (assetUrlToLocal.has(assetUrl)) return;
  try {
    const u = new URL(assetUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    if (!ALLOWED_HOSTS.has(u.hostname)) return;
    const res = await fetch(assetUrl);
    if (!res.ok) return;
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = assetUrlToPath(assetUrl);
    if (!outPath) return;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    assetUrlToLocal.set(assetUrl, path.relative(OUT_DIR, outPath).replace(/\\/g, '/'));
  } catch {}
}

export function assetUrlToPath(assetUrl, ASSETS_DIR) {
  try {
    const u = new URL(assetUrl);
    let pathname = u.pathname.replace(/\/+/, '/').replace(/^\//, '');
    let ext = path.extname(pathname);
    let base = pathname.replace(/\//g, '_').replace(ext, '');
    if (!ext) ext = '';
    return path.join(ASSETS_DIR, base + ext);
  } catch {
    return null;
  }
}
