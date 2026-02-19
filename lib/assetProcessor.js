// assetProcessor.js
// Core logic for extracting, replacing, and mapping asset references in HTML, CSS, and JS

/**
 * Extracts asset URLs from HTML content (src, href).
 */
export function extractLinksFromHtml(html) {
  // Helper to decode HTML entities
  const decodeEntities = (str) => str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x[0-9a-fA-F]+;/g, (m) => String.fromCharCode(parseInt(m.slice(3, -1), 16))).replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1), 10)));

  const links = [];
  // Remove comments
  html = html.replace(/<!--([\s\S]*?)-->/g, '');

  // src, href, data-*, xlink:href, and <object data="...">
  const attrRegex = /(src|href|data|data-[\w-]+|xlink:href)=(['"])([^'"\s>]+)(?:\s*[^>]*)?\2/gi;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    links.push(decodeEntities(match[3]));
  }

  // srcset (multiple URLs)
  const srcsetRegex = /srcset=(['"])([^'"]+)\1/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    // Split by comma, then take the URL part before whitespace
    const urls = match[2].split(',').map(s => {
      let ref = s.trim().split(' ')[0];
      // Decode HTML entities
      ref = decodeEntities(ref);
      return ref;
    }).filter(Boolean);
    links.push(...urls);
  }

  // meta refresh
  const metaRefreshRegex = /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>\s]+)["']/gi;
  while ((match = metaRefreshRegex.exec(html)) !== null) {
    links.push(decodeEntities(match[1]));
  }

  // Inline style attribute (background:url(...))
  const styleAttrRegex = /style=(['"])([\s\S]*?)\1/gi;
  while ((match = styleAttrRegex.exec(html)) !== null) {
    const style = match[2];
    const urlRegex = /url\((['"]?)([^'"\)]+)\1\)/gi;
    let m2;
    while ((m2 = urlRegex.exec(style)) !== null) {
      let ref = m2[2];
      // Decode HTML entities
      ref = decodeEntities(ref);
      links.push(ref);
    }
  }

  return links;
}

/**
 * Extracts asset URLs from CSS content (url()).
 */
export function extractLinksFromCss(css) {
  const links = [];
  const urlRegex = /url\((['"]?)([^'"\)]+)\1\)/gi;
  let match;
  while ((match = urlRegex.exec(css)) !== null) {
    links.push(match[2]);
  }
  return links;
}

/**
 * Extracts asset URLs from JS content (import/require, string URLs).
 * (Simple heuristic, not a full parser)
 */
export function extractLinksFromJs(js) {
  const links = [];
  // import ... from '...'; require('...'); fetch('...'); import '...';
  const importFromRegex = /import\s+[^'";]+\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importFromRegex.exec(js)) !== null) {
    links.push(match[1]);
  }
  const importOnlyRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = importOnlyRegex.exec(js)) !== null) {
    links.push(match[1]);
  }
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(js)) !== null) {
    links.push(match[1]);
  }
  const fetchRegex = /fetch\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = fetchRegex.exec(js)) !== null) {
    links.push(match[1]);
  }
  const urlStringRegex = /['"](https?:\/\/[^'"]+)['"]/g;
  while ((match = urlStringRegex.exec(js)) !== null) {
    links.push(match[1]);
  }
  return links;
}

/**
 * Rewrites asset references in HTML using a urlMap.
 */
export function rewriteHtmlLinks(html, urlMap, baseUrl, host) {
  const attrRegex = /(src|href|data|poster|formaction)=(['"])([^'"\s]+)\2/gi;
  html = html.replace(attrRegex, (m, attr, quote, ref) => {
    const decodedRef = String(ref)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (/^(data:|#)/.test(decodedRef)) return m;
    let absUrl;
    try {
      absUrl = new URL(decodedRef, baseUrl).toString();
      absUrl = normalize(absUrl);
    } catch { return m; }
    // Try exact match first, then try without query string
    if (urlMap[absUrl]) {
      const local = urlMap[absUrl];
      if (attr.toLowerCase() === 'href') {
        try {
          const parsed = new URL(absUrl);
          const ext = path.extname(parsed.pathname || '').toLowerCase();
          const isPageLike = !ext || ext === '.html' || ext === '.htm';
          const pointsToAssets = /(?:^|\/)assets\//i.test(local);
          if (isPageLike && pointsToAssets) return m;
        } catch {}
      }
      return `${attr}=${quote}${urlMap[absUrl]}${quote}`;
    }
    // Try matching without query string (for URLs with different query strings that map to same asset)
    const absUrlWithoutQuery = absUrl.split('?')[0];
    const matchingUrl = Object.keys(urlMap).find(key => key.split('?')[0] === absUrlWithoutQuery);
    if (matchingUrl) {
      return `${attr}=${quote}${urlMap[matchingUrl]}${quote}`;
    }
    return m;
  });

  // Rewrite srcset attributes
  const srcsetRegex = /srcset=(['"])([^'"]+)\1/gi;
  html = html.replace(srcsetRegex, (m, quote, srcset) => {
    const newSrcset = srcset.split(',').map(s => {
      const parts = s.trim().split(/\s+/);
      let ref = parts[0];
      // Decode HTML entities
      ref = ref.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      let absUrl;
      try {
        absUrl = new URL(ref, baseUrl).toString();
        absUrl = normalize(absUrl);
      } catch { return s; }
      // Try exact match first
      if (urlMap[absUrl]) {
        parts[0] = urlMap[absUrl];
      } else {
        // Try matching without query string
        const absUrlWithoutQuery = absUrl.split('?')[0];
        const matchingUrl = Object.keys(urlMap).find(key => key.split('?')[0] === absUrlWithoutQuery);
        if (matchingUrl) {
          parts[0] = urlMap[matchingUrl];
        }
      }
      return parts.join(' ');
    }).join(', ');
    return `srcset=${quote}${newSrcset}${quote}`;
  });

  // Rewrite URLs in style attributes
  const styleAttrRegex = /style=(['"])([\s\S]*?)\1/gi;
  html = html.replace(styleAttrRegex, (m, quote, style) => {
    // Match url(...) with any content (including HTML entities)
    const urlRegex = /url\(\s*(?:['"&])*([^)]+?)(?:['"&])*\s*\)/gi;
    const newStyle = style.replace(urlRegex, (m2) => {
      // Extract the URL from url(...)
      let ref = m2.replace(/url\(\s*/, '').replace(/\s*\)$/, '');
      // Remove quotes and/or entities
      ref = ref.replace(/^(&quot;|['"&])|(&quot;|['"&])$/g, '');
      // Decode HTML entities in ref
      ref = ref.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      ref = ref.trim();
      let absUrl;
      try {
        absUrl = new URL(ref, baseUrl).toString();
        absUrl = normalize(absUrl);
      } catch { return m2; }
      // Try exact match first
      if (urlMap[absUrl]) {
        return `url(${urlMap[absUrl]})`;
      }
      // Try matching without query string
      const absUrlWithoutQuery = absUrl.split('?')[0];
      const matchingUrl = Object.keys(urlMap).find(key => key.split('?')[0] === absUrlWithoutQuery);
      if (matchingUrl) {
        return `url(${urlMap[matchingUrl]})`;
      }
      return m2;
    });
    return `style=${quote}${newStyle}${quote}`;
  });

  return html;
}

/**
 * Rewrites asset references in CSS using a urlMap.
 */
export function rewriteCssLinks(css, urlMap, baseUrl) {
  const urlRegex = /url\((['"]?)([^'"\)]+)\1\)/gi;
  return css.replace(urlRegex, (m, quote, ref) => {
    let absUrl;
    try {
      absUrl = new URL(ref, baseUrl).toString();
      absUrl = normalize(absUrl);
    } catch { return m; }
    if (urlMap[absUrl]) {
      return `url(${quote}${urlMap[absUrl]}${quote})`;
    }
    return m;
  });
}

/**
 * Rewrites asset references in JS using a urlMap (simple string replacement for URLs).
 */
export function rewriteJsLinks(js, urlMap, baseUrl) {
  // Only replace exact matches for URLs in urlMap
  let out = js;
  for (const [absUrl, local] of Object.entries(urlMap)) {
    out = out.split(absUrl).join(local);
  }
  return out;
}

// Additional processing functions

import fs from "node:fs";
import path from "node:path";

// Map from asset URL to local asset path (relative to OUT_DIR)
const assetUrlToLocal = new Map();

// Helper: Rewrite URLs in CSS, HTML, and JS to local asset paths, download referenced assets
export async function processCssFile(cssPath, baseUrl, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS) {
  const ASSETS_DIR = path.join(OUT_DIR, "assets");
  let css = fs.readFileSync(cssPath, "utf8");
  const urlRegex = /url\((['"]?)([^'"\)]+)\1\)/g;
  let match;
  const found = new Set();
  while ((match = urlRegex.exec(css)) !== null) {
    let ref = match[2];
    if (/^data:/.test(ref)) continue;
    let absUrl;
    try {
      absUrl = new URL(ref, baseUrl).toString();
    } catch { continue; }
    found.add(absUrl);
  }
  for (const assetUrl of found) {
    await downloadAsset(assetUrl, assetUrlToLocal, ASSETS_DIR, ALLOWED_HOSTS);
  }
  css = css.replace(urlRegex, (m, quote, ref) => {
    if (/^data:/.test(ref)) return m;
    let absUrl;
    try {
      absUrl = new URL(ref, baseUrl).toString();
    } catch { return m; }
    const local = assetUrlToLocal[absUrl];
    if (local) {
      const relPath = getRelativeAssetPath(cssPath, path.join(OUT_DIR, local));
      return `url(${quote}${relPath}${quote})`;
    }
    return m;
  });
  fs.writeFileSync(cssPath, css, "utf8");
}

// Maintain a map of crawled page URLs to saved filenames
const pageUrlToFile = new Map();
const pageUrlToFileAllForms = new Map();

export async function processHtmlFile(htmlPath, baseUrl, pageUrlToFileAllForms, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS) {
  const ASSETS_DIR = path.join(OUT_DIR, "assets");
  let html = fs.readFileSync(htmlPath, "utf8");

  const isLikelyAssetAbsoluteUrl = (absUrl) => {
    try {
      const u = new URL(absUrl);
      if (!ALLOWED_HOSTS.has(u.hostname)) return false;
      const ext = path.extname(u.pathname || '').toLowerCase();
      if (!ext) return false;
      if (ext === '.html' || ext === '.htm') return false;
      return true;
    } catch {
      return false;
    }
  };

  // Extract ALL links from HTML (src, href, srcset, style urls, etc.)
  const allLinks = extractLinksFromHtml(html);
  
  // Convert to absolute URLs and download
  const found = new Set();
  for (const ref of allLinks) {
    if (/^(data:|#)/.test(ref)) continue;
    let absUrl;
    try {
      absUrl = new URL(ref, baseUrl).toString();
    } catch { 
      continue;
    }
    if (!isLikelyAssetAbsoluteUrl(absUrl)) continue;
    found.add(absUrl);
  }
  for (const assetUrl of found) {
    await downloadAsset(assetUrl, assetUrlToLocal, ASSETS_DIR, ALLOWED_HOSTS);
  }

  // Build URL map for rewriting (absolute URL -> relative local path)
  const urlMap = {};
  const host = new URL(baseUrl).hostname;
  for (const [absUrl, localPath] of Object.entries(assetUrlToLocal)) {
    const relPath = getRelativeAssetPath(htmlPath, path.join(OUT_DIR, localPath));
    urlMap[absUrl] = relPath;
  }

  // Rewrite HTML links using comprehensive rewriteHtmlLinks function
  html = rewriteHtmlLinks(html, urlMap, baseUrl, host);

  // Also handle crawled pages (href links to other pages)
  if (pageUrlToFileAllForms) {
    const pageUrlRegex = /href=(['"])([^'"]+)\1/gi;
    html = html.replace(pageUrlRegex, (m, quote, ref) => {
      if (/^(data:|#)/.test(ref)) return m;
      if (/^(?:\.\/|\.\.\/)?assets\//i.test(ref)) return m;
      let absUrl;
      try {
        absUrl = new URL(ref, baseUrl).toString();
      } catch { return m; }

      // Keep asset-like hrefs (icons, manifests, styles, etc.) as asset references, not page links
      try {
        const u = new URL(absUrl);
        const pathname = u.pathname.toLowerCase();
        const isAssetHref = /\.(?:css|js|mjs|json|map|png|jpe?g|gif|svg|webp|ico|bmp|avif|woff2?|ttf|eot|otf|xml|txt|pdf|webmanifest)$/i.test(pathname);
        if (isAssetHref && ALLOWED_HOSTS.has(u.hostname)) {
          const localAsset = assetUrlToLocal[absUrl];
          if (localAsset) {
            const relAssetPath = getRelativeAssetPath(htmlPath, path.join(OUT_DIR, localAsset));
            return `href=${quote}${relAssetPath}${quote}`;
          }
          const assumedAssetPath = assetUrlToPath(absUrl, path.join(OUT_DIR, 'assets'), ALLOWED_HOSTS);
          if (assumedAssetPath) {
            const relAssetPath = getRelativeAssetPath(htmlPath, assumedAssetPath);
            return `href=${quote}${relAssetPath}${quote}`;
          }
        }
      } catch {}
      
      let localFile = null;
      if (pageUrlToFileAllForms.has(normalize(absUrl))) {
        localFile = pageUrlToFileAllForms.get(normalize(absUrl));
      } else if (pageUrlToFileAllForms.has(ref)) {
        localFile = pageUrlToFileAllForms.get(ref);
      }
      if (localFile) {
        const relPath = getRelativeAssetPath(htmlPath, path.join(OUT_DIR, localFile));
        return `href=${quote}${relPath}${quote}`;
      } else {
        // If not crawled, but in scope, assume the filename
        try {
          const u = new URL(absUrl);
          if (ALLOWED_HOSTS.has(u.hostname)) {
            const assumedFile = urlToFilename(absUrl);
            const relPath = getRelativeAssetPath(htmlPath, path.join(OUT_DIR, assumedFile));
            return `href=${quote}${relPath}${quote}`;
          }
        } catch {}
      }
      return m;
    });
  }

  fs.writeFileSync(htmlPath, html, "utf8");
}

export async function processJsFile(jsPath, baseUrl, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS) {
  const ASSETS_DIR = path.join(OUT_DIR, "assets");
  let js = fs.readFileSync(jsPath, "utf8");
  const isLikelyAssetPath = (rawPath) => {
    try {
      const u = new URL(rawPath, baseUrl);
      const ext = path.extname(u.pathname || '').toLowerCase();
      if (!ext) return false;
      if (ext === '.html' || ext === '.htm') return false;
      return true;
    } catch {
      return false;
    }
  };

  // Match string literals containing URLs/paths
  const absoluteUrlRegex = /(["'`])((?:https?:)?\/\/[^"'`\s]+)\1/g;
  const rootRelativeRegex = /(["'`])(\/[^"'`\s]+)\1/g;

  const found = new Set();
  const collectCandidate = (ref) => {
    if (/^data:/.test(ref)) return;
    if (/^\/(api|jsl10n)\b/i.test(ref)) return;
    if (!/^https?:\/\//i.test(ref) && !/^\//.test(ref)) return;
    let absUrl;
    try {
      absUrl = new URL(ref, baseUrl).toString();
    } catch { return; }
    try {
      const u = new URL(absUrl);
      if (!ALLOWED_HOSTS.has(u.hostname)) return;
      if (isLikelyAssetPath(absUrl)) {
        found.add(absUrl);
      }
    } catch {}
  };

  let match;
  while ((match = absoluteUrlRegex.exec(js)) !== null) {
    collectCandidate(match[2]);
  }
  while ((match = rootRelativeRegex.exec(js)) !== null) {
    collectCandidate(match[2]);
  }

  for (const assetUrl of found) {
    await downloadAsset(assetUrl, assetUrlToLocal, ASSETS_DIR, ALLOWED_HOSTS);
  }

  const rewriteCandidate = (m, quote, ref) => {
    if (/^data:/.test(ref)) return m;
    if (/^\/(api|jsl10n)\b/i.test(ref)) return m;
    if (!/^https?:\/\//i.test(ref) && !/^\//.test(ref)) return m;

    let absUrl;
    try {
      absUrl = new URL(ref, baseUrl).toString();
    } catch { return m; }

    let parsed;
    try {
      parsed = new URL(absUrl);
    } catch {
      return m;
    }
    if (!ALLOWED_HOSTS.has(parsed.hostname)) return m;

    const treatAsAsset = isLikelyAssetPath(absUrl);

    if (!treatAsAsset) return m;

    let local = assetUrlToLocal[absUrl];
    if (!local) {
      const absUrlWithoutQuery = absUrl.split('?')[0];
      const matchingUrl = Object.keys(assetUrlToLocal).find(key => key.split('?')[0] === absUrlWithoutQuery);
      if (matchingUrl) local = assetUrlToLocal[matchingUrl];
    }
    if (!local) return m;

    let assetRelative = String(local).replace(/\\/g, '/').replace(/^\.?\//, '');
    if (/^assets\//i.test(assetRelative)) {
      assetRelative = assetRelative.replace(/^assets\//i, '');
    }
    return `window.__AWA_ASSET__(${quote}${assetRelative}${quote})`;
  };

  js = js.replace(absoluteUrlRegex, rewriteCandidate);
  js = js.replace(rootRelativeRegex, rewriteCandidate);
  fs.writeFileSync(jsPath, js, "utf8");
}

export async function extractLinks(page, baseUrl) {
  return await page.evaluate(() => {
    const links = [];
    for (const a of document.querySelectorAll("a[href]")) {
      links.push(a.getAttribute("href"));
    }
    return links;
  }).then(hrefs => hrefs
    .filter(Boolean)
    .map(h => {
      try { return new URL(h, baseUrl).toString(); }
      catch { return null; }
    })
    .filter(Boolean)
  );
}

export async function downloadAsset(assetUrl, assetUrlToLocal, ASSETS_DIR, ALLOWED_HOSTS) {
  if (assetUrlToLocal[assetUrl]) return;
  try {
    const u = new URL(assetUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return;
    if (!ALLOWED_HOSTS.has(u.hostname)) return;
    const res = await fetch(assetUrl);
    if (!res.ok) return;
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = assetUrlToPath(assetUrl, ASSETS_DIR, ALLOWED_HOSTS);
    if (!outPath) return;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    assetUrlToLocal[assetUrl] = path.relative(path.dirname(ASSETS_DIR), outPath).replace(/\\/g, "/");
  } catch {}
}

// Utility functions
export function assetUrlToPath(assetUrl, ASSETS_DIR, ALLOWED_HOSTS) {
  try {
    const u = new URL(assetUrl);
    if (!ALLOWED_HOSTS.has(u.hostname)) return null;
  } catch {
    return null;
  }
  let filename = urlToFilename(assetUrl).replace(/^\/+/, '');
  while (/^assets\//i.test(filename)) {
    filename = filename.replace(/^assets\//i, '');
  }
  return path.join(ASSETS_DIR, filename);
}

export function urlToFilename(url) {
  try {
    const u = new URL(url);
    let pathPart = u.pathname;
    if (pathPart.endsWith('/')) pathPart = pathPart.slice(0, -1);
    if (!pathPart) pathPart = '/index';
    const query = ''; // u.search ? u.search.replace(/[?&]/g, '_').replace(/=/g, '-') : '';
    const hash = u.hash ? u.hash.replace(/#/g, '__') : '';
    let filename = pathPart + hash;
    // Sanitize
    filename = filename.replace(/[^a-zA-Z0-9._/-]/g, '_');
    if (filename.endsWith('/')) filename = filename.slice(0, -1);
    if (!filename.includes('.')) filename += '.html';
    return filename;
  } catch {
    return 'unknown.html';
  }
}

export function normalize(url) {
  try {
    const u = new URL(url);
    // Remove trailing slash except for root
    let path = u.pathname;
    if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    // Remove hash but KEEP search (query string)
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

export function getRelativeAssetPath(fromPath, toPath) {
  let rel = path.relative(path.dirname(fromPath), toPath).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

export function inScope(url, ALLOWED_HOSTS) {
  try {
    const u = new URL(url);
    if (!ALLOWED_HOSTS.has(u.hostname)) return false;
    const excluded = ["/logout", "/signout"];
    if (excluded.some(p => u.pathname.startsWith(p))) return false;
    return true;
  } catch {
    return false;
  }
}
