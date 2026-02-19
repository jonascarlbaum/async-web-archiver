

import { chromium } from "playwright";
import fs, { rmSync, readdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { program } from "commander";
import {
  extractLinksFromHtml,
  rewriteHtmlLinks,
  processCssFile,
  processHtmlFile,
  processJsFile,
  extractLinks,
  downloadAsset as downloadAssetFallback,
  assetUrlToPath,
  urlToFilename,
  normalize,
  getRelativeAssetPath,
  inScope
} from "./lib/assetProcessor.js";

// Utility functions



if (import.meta.url === `file:///${path.resolve(process.argv[1]).replace(/\\/g, '/')}`) {
  const processStartAt = Date.now();
  const formatElapsed = (ms) => {
    const totalMs = Math.max(0, Math.floor(ms));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const milliseconds = totalMs % 1000;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const mmm = String(milliseconds).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${mmm}`;
  };

  const formatDurationHuman = (ms) => {
    const totalMs = Math.max(0, Math.floor(ms));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const milliseconds = totalMs % 1000;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    if (seconds > 0) {
      return milliseconds > 0 ? `${seconds}s ${milliseconds}ms` : `${seconds}s`;
    }
    return `${milliseconds}ms`;
  };

  const logProgress = {
    stage: '',
    current: null,
    total: null,
    approximate: false
  };

  const setLogProgress = (stage, current = null, total = null, approximate = false) => {
    logProgress.stage = stage || '';
    logProgress.current = Number.isFinite(current) ? current : null;
    logProgress.total = Number.isFinite(total) ? total : null;
    logProgress.approximate = Boolean(approximate);
  };

  const clearLogProgress = () => {
    logProgress.stage = '';
    logProgress.current = null;
    logProgress.total = null;
    logProgress.approximate = false;
  };

  const buildLogPrefix = () => {
    const elapsed = formatElapsed(Date.now() - processStartAt);
    if (!logProgress.stage) {
      return `[+${elapsed}]`;
    }
    if (logProgress.current != null && logProgress.total != null) {
      const approxSuffix = logProgress.approximate ? '+' : '';
      return `[+${elapsed} ${logProgress.stage}: ${logProgress.current}/${logProgress.total}${approxSuffix}]`;
    }
    return `[+${elapsed} ${logProgress.stage}]`;
  };

  const setupElapsedConsole = () => {
    for (const method of ['log', 'info', 'warn', 'error']) {
      const original = console[method].bind(console);
      console[method] = (...args) => original(buildLogPrefix(), ...args);
    }
  };

  setupElapsedConsole();

  program
    .name("playwright-archiver")
    .description(`Crawl a website and save all HTML, CSS, JS, images, and assets for offline use.\n\nUSAGE EXAMPLES:\n  node crawl.js --start-url https://example.com --out-dir ./output\n  node crawl.js --start-url https://example.com --out-dir ./output --replace \"foo::bar\" --replace \"baz::qux\"\n  node crawl.js --start-url https://example.com --out-dir ./output --important-apis /api/data,/api/menu\n  node crawl.js --start-url https://example.com --out-dir ./output --store-api \"GET:https://example.com/api/data,/static/data.json\" --replace \"/api/data::/static/data.json\"\n  node crawl.js --start-url https://example.com --out-dir ./output --store-api \"script:GET:https://example.com/api/script.js,/static/script.js\"\n  node crawl.js --start-url https://example.com --out-dir ./output --store-api \"GET:https://example.com/api/data|Accept:application/json|/static/data.json\"\n\nOPTIONS:`)
    .requiredOption("--start-url <url>", "Start URL (required)")
    .requiredOption("--out-dir <dir>", "Output directory (required)")
    .option("--allowed-hosts <hosts>", "Comma-separated allowed hosts (default: host of start-url)")
    .option("--max-pages <n>", "Max pages to crawl (default: 5000)", "5000")
    .option("--ignore-max", "Ignore max-pages cap and crawl until queue is exhausted")
    .option("--concurrency <n>", "Number of concurrent browser workers (default: 3)", "3")
    .option("--delay-ms <n>", "Delay between requests in ms (default: 200)", "200")
    .option("--ajax-wait-ms <n>", "Extra wait after networkidle for delayed API calls (default: 0)", "0")
    .option("--important-apis <apis>", "Comma-separated list of important API endpoints to wait for after navigation (default: none; only needed for sites with slow AJAX)")
    .option("--asset-prefixes <prefixes>", "Comma-separated in-scope URL path prefixes to force-download as assets (default: none)")
    .option("--force", "Delete output directory without confirmation")
    .option("--store-api <methodurl>", "Store API response: [type:]method:url[|headers]|path. Headers as key:value,key:value. Type is 'json' or 'script' (default json). Can be specified multiple times.", (v, p) => { p.push(v); return p; }, [])
    .option("--replace <fromto>", "String replacement in all output files, format: from::to. Can be specified multiple times.", (v, p) => { p.push(v); return p; }, [])
    .option("--help", "Show help and usage instructions");

  if (process.argv.includes('--help')) {
    program.help();
  }

  program.parse(process.argv);

  console.log('Arguments parsed, starting main...');
  const opts = program.opts();
  const START_URL = opts.startUrl;
  const OUT_DIR = opts.outDir;
  const ALLOWED_HOSTS = opts.allowedHosts
    ? new Set(opts.allowedHosts.split(","))
    : new Set([new URL(START_URL).hostname]);
  const MAX_PAGES = parseInt(opts.maxPages, 10);
  const IGNORE_MAX = Boolean(opts.ignoreMax);
  const MAX_PAGES_EFFECTIVE = IGNORE_MAX ? Number.POSITIVE_INFINITY : MAX_PAGES;
  const CONCURRENCY = parseInt(opts.concurrency, 10);

  const DELAY_MS = parseInt(opts.delayMs, 10);
  const AJAX_WAIT_MS = parseInt(opts.ajaxWaitMs, 10);
  const FORCE = Boolean(opts.force);
  const IMPORTANT_APIS = opts.importantApis
    ? opts.importantApis.split(",")
    : [];
  const ASSET_PREFIXES = (opts.assetPrefixes || '')
    .split(',')
    .map((prefix) => prefix.trim())
    .filter(Boolean)
    .map((prefix) => {
      const withSlash = prefix.startsWith('/') ? prefix : `/${prefix}`;
      return withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
    });

  const ASSETS_DIR = path.join(OUT_DIR, "assets");

  const askToDeleteOutputDir = (resolvedOutDir) => new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Output directory "${resolvedOutDir}" will be fully deleted. Continue? [y/N] `, (answer) => {
      rl.close();
      resolve(/^(y|yes)$/i.test(String(answer || '').trim()));
    });
  });

  const prepareOutputDir = async (outDir, forceDelete = false) => {
    const resolvedOutDir = path.resolve(outDir);
    if (resolvedOutDir === '/' || resolvedOutDir === 'C:\\' || resolvedOutDir === 'C:/' || resolvedOutDir.length < 10) {
      throw new Error(`Output directory ${resolvedOutDir} seems unsafe, aborting cleanup to prevent collateral damage`);
    }

    const exists = fs.existsSync(resolvedOutDir);
    if (exists) {
      let hasEntries = false;
      try {
        hasEntries = readdirSync(resolvedOutDir).length > 0;
      } catch {}

      if (hasEntries) {
        if (!forceDelete) {
          if (!process.stdin.isTTY || !process.stdout.isTTY) {
            throw new Error(`Output directory ${resolvedOutDir} is not empty. Re-run with --force to delete without prompt.`);
          }
          const confirmed = await askToDeleteOutputDir(resolvedOutDir);
          if (!confirmed) {
            throw new Error('Aborted by user before deleting output directory.');
          }
        }
        rmSync(resolvedOutDir, { recursive: true, force: true });
      }
    }

    fs.mkdirSync(resolvedOutDir, { recursive: true });
  };
  // ... rest of main logic ...

  async function main() {
    setLogProgress('startup');
    console.log('Starting awa.js main()');
    console.log('START_URL:', START_URL);
    console.log('OUT_DIR:', OUT_DIR);
    console.log('ALLOWED_HOSTS:', ALLOWED_HOSTS);
    console.log('MAX_PAGES:', MAX_PAGES);
    console.log('IGNORE_MAX:', IGNORE_MAX);
    console.log('CONCURRENCY:', CONCURRENCY);
    console.log('DELAY_MS:', DELAY_MS);
    console.log('AJAX_WAIT_MS:', AJAX_WAIT_MS);
    console.log('IMPORTANT_APIS:', IMPORTANT_APIS);
    console.log('ASSET_PREFIXES:', ASSET_PREFIXES);
    console.log('FORCE:', FORCE);

    await prepareOutputDir(OUT_DIR, FORCE);
    fs.mkdirSync(ASSETS_DIR, { recursive: true });

    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    console.log('Browser launched');
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    console.log('Context created');

    const queue = [normalize(START_URL)];
    const queued = new Set([normalize(START_URL)]);
    const seen = new Set();
    let processed = 0;
    let manualStoredApiCount = 0;
    const assetSeen = new Set();
    const autoApiSeen = new Set();
    const autoApiResources = new Map();
    const autoApiCallCounts = new Map();
    const pendingResponseTasks = new Set();

    const hasNonHtmlExtension = (pathname) => {
      const ext = path.extname(pathname || '').toLowerCase();
      return Boolean(ext && ext !== '.html' && ext !== '.htm');
    };

    const isInScopeExtensionAssetUrl = (rawUrl) => {
      try {
        const u = new URL(rawUrl);
        if (!ALLOWED_HOSTS.has(u.hostname)) return false;
        return hasNonHtmlExtension(u.pathname);
      } catch {
        return false;
      }
    };

    const isPrefetchAssetUrl = (rawUrl) => {
      try {
        const u = new URL(rawUrl);
        if (!ALLOWED_HOSTS.has(u.hostname)) return false;
        if (ASSET_PREFIXES.length === 0) return false;
        return ASSET_PREFIXES.some((prefix) => u.pathname === prefix || u.pathname.startsWith(`${prefix}/`));
      } catch {
        return false;
      }
    };

    const downloadAssetWithContext = async (assetUrl, assetUrlToLocalRef, ASSETS_DIR_PARAM, ALLOWED_HOSTS_PARAM) => {
      if (assetUrlToLocalRef[assetUrl]) return;
      const outPath = assetUrlToPath(assetUrl, ASSETS_DIR_PARAM, ALLOWED_HOSTS_PARAM);
      if (!outPath) return;
      try {
        const response = await context.request.get(assetUrl, {
          headers: { 'Cookie': 'EPiStateMarker=true' }
        });
        if (!response.ok()) {
          await downloadAssetFallback(assetUrl, assetUrlToLocalRef, ASSETS_DIR_PARAM, ALLOWED_HOSTS_PARAM);
          return;
        }
        const buf = Buffer.from(await response.body());
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buf);
        assetUrlToLocalRef[assetUrl] = path.relative(OUT_DIR, outPath).replace(/\\/g, '/');
      } catch {
        await downloadAssetFallback(assetUrl, assetUrlToLocalRef, ASSETS_DIR_PARAM, ALLOWED_HOSTS_PARAM);
      }
    };

    const buildBodyHash = (body) => {
      const str = typeof body === 'string' ? body : String(body);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
      }
      return String(Math.abs(hash));
    };

    const buildRequestSignature = (method, rawUrl, bodyHash = '') => {
      const normalizedMethod = (method || 'GET').toUpperCase();
      const base = `${normalizedMethod} ${normalize(rawUrl)}`;
      return bodyHash ? `${base} #${bodyHash}` : base;
    };

    const toOutRelativePath = (absolutePathInOutDir, fromHtmlPath = null) => {
      const fromDir = fromHtmlPath ? path.dirname(fromHtmlPath) : OUT_DIR;
      let rel = path.relative(fromDir, absolutePathInOutDir).replace(/\\/g, '/');
      if (!rel) rel = './';
      if (!rel.startsWith('.')) rel = './' + rel;
      return rel;
    };

    const rewriteJsonUrlStringForOffline = (rawValue, fromHtmlPath = null) => {
      if (typeof rawValue !== 'string') return rawValue;
      const trimmed = rawValue.trim();
      if (!trimmed) return rawValue;

      const decoded = trimmed
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      if (!decoded) return rawValue;

      let absUrl;
      try {
        if (/^https?:\/\//i.test(decoded)) {
          absUrl = new URL(decoded).toString();
        } else if (decoded.startsWith('/')) {
          absUrl = new URL(decoded, START_URL).toString();
        } else {
          return rawValue;
        }
      } catch {
        return rawValue;
      }

      try {
        const u = new URL(absUrl);
        if (!ALLOWED_HOSTS.has(u.hostname)) return rawValue;

        // Keep API/localization endpoints as-is (fetch wrapper resolves them via aliases)
        if (/^\/(api|jsl10n)\b/i.test(u.pathname)) return rawValue;

        const hasNonHtmlExt = (() => {
          const ext = path.extname(u.pathname || '').toLowerCase();
          return Boolean(ext && ext !== '.html' && ext !== '.htm');
        })();
        const isConfiguredAssetPrefixPath = ASSET_PREFIXES.some((prefix) => u.pathname === prefix || u.pathname.startsWith(`${prefix}/`));
        if (hasNonHtmlExt || isConfiguredAssetPrefixPath) {
          const assumedAssetPath = assetUrlToPath(absUrl, path.join(OUT_DIR, 'assets'), ALLOWED_HOSTS);
          if (!assumedAssetPath) return rawValue;
          return toOutRelativePath(assumedAssetPath, fromHtmlPath);
        }

        // Treat remaining in-scope URLs as pages
        let localFile = null;
        const normAbs = normalize(absUrl);
        if (pageUrlToFileAllForms.has(normAbs)) {
          localFile = pageUrlToFileAllForms.get(normAbs);
        }
        if (!localFile) {
          localFile = urlToFilename(absUrl);
        }
        return toOutRelativePath(path.join(OUT_DIR, localFile), fromHtmlPath);
      } catch {
        return rawValue;
      }
    };

    const rewriteJsonUrlsForOffline = (value, fromHtmlPath = null) => {
      if (Array.isArray(value)) {
        return value.map((entry) => rewriteJsonUrlsForOffline(entry, fromHtmlPath));
      }
      if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
          out[k] = rewriteJsonUrlsForOffline(v, fromHtmlPath);
        }
        return out;
      }
      if (typeof value === 'string') {
        return rewriteJsonUrlStringForOffline(value, fromHtmlPath);
      }
      return value;
    };

    const buildAutoApiLocalPath = (method, rawUrl, bodyHash = '', contentType = '') => {
      try {
        const u = new URL(rawUrl);
        const ext = /json/i.test(contentType) ? '.json' : '.txt';
        const slug = `${(method || 'GET').toUpperCase()}_${u.hostname}${u.pathname}${u.search}${bodyHash ? `_body_${bodyHash}` : ''}`
          .replace(/[^a-zA-Z0-9._-]+/g, '_')
          .replace(/^_+|_+$/g, '');
        const filename = slug.endsWith(ext) ? slug : `${slug}${ext}`;
        return `/static/auto/${filename}`;
      } catch {
        return null;
      }
    };

    const captureApiResponse = async (requestMeta, responseMeta, responseBodyBuffer) => {
      const { method, url: requestUrl, bodyHash = '' } = requestMeta;
      const signature = buildRequestSignature(method, requestUrl, bodyHash);
      autoApiCallCounts.set(signature, (autoApiCallCounts.get(signature) || 0) + 1);
      if (autoApiSeen.has(signature)) return;
      const { status, statusText, headers: responseHeaders } = responseMeta;
      const raw = responseBodyBuffer.toString('utf8').replace(/^\uFEFF/, '');

      let parsedJson;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        return;
      }

      const localpath = buildAutoApiLocalPath(method, requestUrl, bodyHash, 'application/json');
      if (!localpath) return;
      const outPath = path.join(OUT_DIR, localpath);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(parsedJson), 'utf8');
      autoApiSeen.add(signature);
      autoApiResources.set(signature, {
        signature,
        method: (method || 'GET').toUpperCase(),
        url: requestUrl,
        bodyHash,
        localpath,
        response: {
          status,
          statusText,
          headers: (() => {
            const headers = { ...responseHeaders };
            const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
            if (!hasContentType) {
              headers['content-type'] = 'application/json';
            }
            return headers;
          })(),
          body: JSON.stringify(parsedJson)
        }
      });
      console.log(`Captured API ${method || 'GET'} ${requestUrl}`);
    };

    await context.route('**/*', async (route) => {
      try {
        const response = await route.fetch();
        try {
          const req = route.request();
          const resourceType = req.resourceType();
          const reqUrl = req.url();
          const reqMethod = req.method();
          const reqBody = req.postData() || '';
          const reqBodyHash = reqBody ? buildBodyHash(reqBody) : '';
          const isSupportedMethod = /^(GET|POST|PUT|PATCH|DELETE)$/i.test(reqMethod);
          const isLikelyProgrammatic = resourceType === 'fetch' || resourceType === 'xhr' || resourceType === 'other';
          if (isLikelyProgrammatic && isSupportedMethod) {
            const bodyBuf = await response.body();
            await captureApiResponse(
              { method: reqMethod, url: reqUrl, bodyHash: reqBodyHash },
              { status: response.status(), statusText: response.statusText(), headers: response.headers() },
              bodyBuf
            );
          }
        } catch {}
        await route.fulfill({ response });
      } catch {
        await route.continue();
      }
    });

    async function worker(id) {
      console.log(`Worker ${id} started`);
      const page = await context.newPage();

      const isTrackableApiRequest = (req) => {
        try {
          const type = req.resourceType();
          const method = req.method();
          const reqUrl = req.url();
          const isApiLikeUrl = (() => {
            try {
              const u = new URL(reqUrl);
              return /\/(api|jsl10n)\b/i.test(u.pathname);
            } catch {
              return /\/(api|jsl10n)\b/i.test(reqUrl);
            }
          })();
          return /^(GET|POST|PUT|PATCH|DELETE)$/i.test(method) && (type === 'fetch' || type === 'xhr' || isApiLikeUrl);
        } catch {
          return false;
        }
      };

      let trackedPendingRequests = 0;
      let trackedLastActivityAt = Date.now();

      page.on('request', (req) => {
        if (!isTrackableApiRequest(req)) return;
        trackedPendingRequests += 1;
        trackedLastActivityAt = Date.now();
      });

      const onTrackedRequestDone = (req) => {
        if (!isTrackableApiRequest(req)) return;
        trackedPendingRequests = Math.max(0, trackedPendingRequests - 1);
        trackedLastActivityAt = Date.now();
      };

      page.on('requestfinished', onTrackedRequestDone);
      page.on('requestfailed', onTrackedRequestDone);

      // Intercept and save assets
      page.on('response', (response) => {
        const task = (async () => {
          try {
            const req = response.request();
            const url = req.url();
            const ct = response.headers()['content-type'] || '';

            if (/css|image|font|javascript|octet-stream|svg|webp|woff|woff2|ttf|eot|ico|audio|video/i.test(ct)) {
              if (assetSeen.has(url)) return;
              assetSeen.add(url);
              const buf = await response.body().catch(() => null);
              if (!buf) return;
              const outPath = assetUrlToPath(url, ASSETS_DIR, ALLOWED_HOSTS);
              if (!outPath) return;
              fs.mkdirSync(path.dirname(outPath), { recursive: true });
              fs.writeFileSync(outPath, buf);
              assetUrlToLocal[url] = path.relative(OUT_DIR, outPath).replace(/\\/g, "/");
            }
          } catch {}
        })();

        pendingResponseTasks.add(task);
        task.finally(() => pendingResponseTasks.delete(task));
      });

      while (processed < MAX_PAGES_EFFECTIVE) {
        const discoveredPages = Math.max(seen.size + queue.length, processed + 1);
        setLogProgress('download pages', processed + 1, discoveredPages, true);
        console.log(`Worker ${id} processing, queue: ${queue.length}`);
        const next = queue.shift();
        if (!next) break;
        queued.delete(next);

        const url = normalize(next);
        if (seen.has(url) || !inScope(url, ALLOWED_HOSTS)) continue;
        seen.add(url);

        try {
          console.log('Navigating to:', url);
          const importantApiWaiters = IMPORTANT_APIS.map((api) =>
            page.waitForResponse((resp) => resp.url().includes(api), { timeout: 30000 }).catch(() => null)
          );
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
          await page.waitForLoadState('networkidle', { timeout: 30000 });

          // Wait for chained API/fetch activity to become idle.
          // This catches then->fetch->then->fetch sequences that continue after initial networkidle.
          const apiChainMaxWaitMs = AJAX_WAIT_MS > 0 ? AJAX_WAIT_MS : 15000;
          const apiChainQuietMs = 1200;
          const apiChainStart = Date.now();
          while (Date.now() - apiChainStart < apiChainMaxWaitMs) {
            const idleFor = Date.now() - trackedLastActivityAt;
            if (trackedPendingRequests === 0 && idleFor >= apiChainQuietMs) {
              break;
            }
            await page.waitForTimeout(200);
          }

          if (importantApiWaiters.length > 0) {
            await Promise.allSettled(importantApiWaiters);
          }
          console.log('Page loaded, extracting content');
          const html = await page.content();
          console.log('Content extracted, length:', html.length);
          const htmlFile = path.resolve(path.join(OUT_DIR, urlToFilename(url)));
          fs.mkdirSync(path.dirname(htmlFile), { recursive: true });
          fs.writeFileSync(htmlFile, html, "utf8");
          pageUrlToFile.set(normalize(url), urlToFilename(url));
          pageUrlToFile.set(normalize(url), urlToFilename(url));
          try {
            const u = new URL(url);
            let rel = u.pathname;
            if (!rel.startsWith('/')) rel = '/' + rel;
            pageUrlToFileAllForms.set(normalize(url), urlToFilename(url));
            pageUrlToFileAllForms.set(rel, urlToFilename(url));
          } catch {}
          htmlPaths.push(htmlFile); // Collect for post-processing
          htmlPathToUrl.set(htmlFile, url);

          console.log('Extracting links');
          const links = await extractLinks(page, url);
          console.log(`Extracted ${links.length} links from ${url}`);
          for (const link of links) {
            const norm = normalize(link);
            if (isInScopeExtensionAssetUrl(norm) || isPrefetchAssetUrl(norm)) {
              await downloadAssetWithContext(norm, assetUrlToLocal, ASSETS_DIR, ALLOWED_HOSTS);
              continue;
            }
            if (!seen.has(norm) && !queued.has(norm) && inScope(norm, ALLOWED_HOSTS)) {
              console.log(`Adding to queue: ${norm}`);
              queued.add(norm);
              queue.push(norm);
            } else {
              console.log(`Skipping link: ${norm} (seen: ${seen.has(norm)}, queued: ${queued.has(norm)}, inScope: ${inScope(norm, ALLOWED_HOSTS)})`);
            }
          }
          processed++;
          if (processed % 100 === 0) {
            console.log(`Processed: ${processed}, queue: ${queue.length}, seen: ${seen.size}`);
          }
          await sleep(DELAY_MS);
        } catch (e) {
          console.error(`Error processing ${url}:`, e.message);
          fs.appendFileSync(path.join(OUT_DIR, "errors.log"), `${url}\n${String(e)}\n\n`);
        }
      }
      await page.close();
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

    // Ensure all async response handlers (asset writes) are fully flushed
    while (pendingResponseTasks.size > 0) {
      await Promise.allSettled(Array.from(pendingResponseTasks));
    }

    // Store API responses using Playwright
    const STORE_APIS = (opts.storeApi || []).map(api => {
      let parts, typeMethodUrl, headersStr, localpath;
      if (api.includes('|')) {
        parts = api.split('|');
        if (parts.length < 2 || parts.length > 3) throw new Error(`Invalid --store-api: ${api}`);
        typeMethodUrl = parts[0];
        headersStr = parts.length === 3 ? parts[1] : '';
        localpath = parts[parts.length - 1];
      } else {
        parts = api.split(',');
        if (parts.length !== 2) throw new Error(`Invalid --store-api: ${api}`);
        typeMethodUrl = parts[0];
        headersStr = '';
        localpath = parts[1];
      }
      const colonIndex = typeMethodUrl.indexOf(':');
      if (colonIndex === -1) throw new Error(`Invalid method:url in --store-api: ${typeMethodUrl}`);
      const firstPart = typeMethodUrl.slice(0, colonIndex);
      let type = 'json';
      let methodUrl;
      if (firstPart === 'script' || firstPart === 'json') {
        type = firstPart;
        methodUrl = typeMethodUrl.slice(colonIndex + 1);
      } else {
        methodUrl = typeMethodUrl;
      }
      const colonIndex2 = methodUrl.indexOf(':');
      if (colonIndex2 === -1) throw new Error(`Invalid method:url in --store-api: ${methodUrl}`);
      const method = methodUrl.slice(0, colonIndex2);
      const url = methodUrl.slice(colonIndex2 + 1);
      const headers = {};
      if (headersStr) {
        headersStr.split(',').forEach(h => {
          const [k, v] = h.split(':');
          if (k && v) headers[k] = v;
        });
      }
      return { type, method, url, headers, localpath };
    });
    if (STORE_APIS.length > 0) {
      const apiPage = await context.newPage();
      for (const api of STORE_APIS) {
        const { method, url, headers, localpath } = api;
        try {
          const res = await apiPage.request[method.toLowerCase()](url, {
            headers: {
              'Cookie': 'EPiStateMarker=true',
              ...headers
            }
          });
          if (res.ok()) {
            const buf = Buffer.from(await res.body());
            const outPath = path.join(OUT_DIR, localpath);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, buf);
            manualStoredApiCount += 1;
            console.log(`Stored API ${method}:${url} to ${localpath}`);
          } else {
            console.error(`Failed to store API ${method}:${url}: ${res.status()}`);
          }
        } catch (e) {
          console.error(`Failed to store API ${method}:${url}:`, e.message);
        }
      }
      await apiPage.close();
    }

    const totalApiCalls = Array.from(autoApiCallCounts.values()).reduce((sum, n) => sum + n, 0);
    console.log(`API capture summary: ${totalApiCalls} calls, ${autoApiResources.size} unique stored`);

    // Post-process assets
    setLogProgress('rewriting assets', 0, Object.keys(assetUrlToLocal).length);
    console.log('Starting post-process for assets');
    const assetFiles = Object.entries(assetUrlToLocal);
    for (let index = 0; index < assetFiles.length; index++) {
      setLogProgress('rewriting assets', index + 1, assetFiles.length);
      const [url, relPath] = assetFiles[index];
      const absPath = path.join(OUT_DIR, relPath);
      if (relPath.endsWith('.css')) {
        console.log('Processing CSS:', relPath);
        await processCssFile(absPath, url, assetUrlToLocal, OUT_DIR, downloadAssetWithContext, ALLOWED_HOSTS);
      } else if (relPath.endsWith('.js')) {
        console.log('Processing JS:', relPath);
        await processJsFile(absPath, url, assetUrlToLocal, OUT_DIR, downloadAssetWithContext, ALLOWED_HOSTS);
      }
    }

    // Process all HTML files
    setLogProgress('rewriting pages', 0, htmlPaths.length);
    console.log('Processing HTML files');
    console.log('htmlPaths:', htmlPaths);
    console.log('htmlPathToUrl keys:', Array.from(htmlPathToUrl.keys()));
    for (let index = 0; index < htmlPaths.length; index++) {
      setLogProgress('rewriting pages', index + 1, htmlPaths.length);
      const htmlPath = htmlPaths[index];
      const url = htmlPathToUrl.get(htmlPath);
      console.log(`Processing ${htmlPath} with baseUrl: ${url}`);
      await processHtmlFile(htmlPath, url, pageUrlToFileAllForms, assetUrlToLocal, OUT_DIR, downloadAssetWithContext, ALLOWED_HOSTS);
    }

    // Write urls.txt as before
    fs.writeFileSync(path.join(OUT_DIR, "urls.txt"), [...seen].join("\n"), "utf8");

    // Write index.html as the HTML of the START_URL
    const startHtmlFile = path.join(OUT_DIR, urlToFilename(START_URL));
    const indexHtmlFile = path.join(OUT_DIR, "index.html");
    if (fs.existsSync(startHtmlFile)) {
      fs.copyFileSync(startHtmlFile, indexHtmlFile);
    }

    // Write sitemap.xml mapping short filenames to original URLs
    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const url of seen) {
      const short = urlToFilename(url);
      sitemap += `  <url>\n    <loc>${short}</loc>\n    <original>${url}</original>\n  </url>\n`;
    }
    sitemap += '</urlset>\n';
    fs.writeFileSync(path.join(OUT_DIR, "sitemap.xml"), sitemap, "utf8");

    // Build API resource base data (rewritten per HTML context at injection time)
    const resourceDataBase = {};

    const addResourceAliases = (fullUrl, responseRecord, method = 'GET', bodyHash = '', localpath = '') => {
      const upperMethod = (method || 'GET').toUpperCase();
      const enrichedRecord = {
        ...responseRecord,
        _localpath: localpath || responseRecord?._localpath || ''
      };
      const methodFull = `${upperMethod} ${fullUrl}`;
      resourceDataBase[methodFull] = enrichedRecord;
      resourceDataBase[fullUrl] = enrichedRecord;
      if (bodyHash) {
        resourceDataBase[`${methodFull} #${bodyHash}`] = enrichedRecord;
      }
      try {
        const u = new URL(fullUrl);
        const methodPathQuery = `${upperMethod} ${u.pathname + u.search}`;
        const methodPath = `${upperMethod} ${u.pathname}`;
        resourceDataBase[methodPathQuery] = enrichedRecord;
        resourceDataBase[methodPath] = enrichedRecord;
        resourceDataBase[u.pathname + u.search] = enrichedRecord;
        resourceDataBase[u.pathname] = enrichedRecord;
        if (bodyHash) {
          resourceDataBase[`${methodPathQuery} #${bodyHash}`] = enrichedRecord;
          resourceDataBase[`${methodPath} #${bodyHash}`] = enrichedRecord;
        }
      } catch {}
    };

    const storedApiFiles = STORE_APIS.map((api) => {
      const fullPath = path.join(OUT_DIR, api.localpath);
      if (!fs.existsSync(fullPath)) return null;
      const content = fs.readFileSync(fullPath, 'utf8');
      if (api.type === 'script') {
        return { api, content, parsedJson: null };
      }
      let parsedJson = null;
      try { parsedJson = JSON.parse(content); } catch {}
      if (parsedJson) {
        addResourceAliases(api.url, {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsedJson)
        }, api.method, '', api.localpath);
      }
      return { api, content, parsedJson };
    }).filter(Boolean);

    for (const [, entry] of autoApiResources.entries()) {
      addResourceAliases(entry.url, entry.response, entry.method, entry.bodyHash, entry.localpath);
    }

    const buildFetchShimScript = (serializedResourceData, rootBasePath, assetBasePath) => `<script>(function(){
  window.__AWA_ROOT_BASE__ = ${JSON.stringify(rootBasePath)};
  window.__AWA_ASSET_BASE__ = ${JSON.stringify(assetBasePath)};
  window.__AWA_PATH__ = function(siteRelativePath){
    var backslash = String.fromCharCode(92);
    var base = String(window.__AWA_ROOT_BASE__ || '.').split(backslash).join('/').replace(/[/]+$/, '');
    var rel = String(siteRelativePath || '').split(backslash).join('/').replace(/^[/]+/, '');
    if (!rel) return base || '.';
    if (!base || base === '.') return './' + rel;
    return base + '/' + rel;
  };
  window.__AWA_ASSET__ = function(assetRelativePath){
    var backslash = String.fromCharCode(92);
    var base = String(window.__AWA_ASSET_BASE__ || './assets').split(backslash).join('/').replace(/[/]+$/, '');
    var rel = String(assetRelativePath || '').split(backslash).join('/').replace(/^[/]+/, '').replace(/^assets[/]/i, '');
    if (!rel) return base || window.__AWA_PATH__('assets');
    if (!base) return window.__AWA_PATH__('assets/' + rel);
    return base + '/' + rel;
  };

  window.__RESOURCE_DATA__ = ${serializedResourceData};
  var data = window.__RESOURCE_DATA__ || {};

  function resolveAbsolute(rawInput){
    var url = typeof rawInput === 'string' ? rawInput : (rawInput && rawInput.url ? rawInput.url : String(rawInput));
    try { return new URL(url, window.location.href).toString(); } catch { return null; }
  }

  function resolveMethod(input, init){
    if (init && init.method) return String(init.method).toUpperCase();
    if (input && input.method) return String(input.method).toUpperCase();
    return 'GET';
  }

  function requestBodyHash(input, init){
    var body = null;
    if (init && Object.prototype.hasOwnProperty.call(init, 'body')) body = init.body;
    else if (input && Object.prototype.hasOwnProperty.call(input, 'body')) body = input.body;
    if (body == null) return '';
    var str = typeof body === 'string' ? body : String(body);
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return String(Math.abs(hash));
  }

  function allKeys(abs, method, bodyHash){
    try {
      var parsed = new URL(abs);
      var keys = [
        method + ' ' + abs,
        method + ' ' + (parsed.pathname + parsed.search),
        method + ' ' + parsed.pathname,
        abs,
        parsed.pathname + parsed.search,
        parsed.pathname
      ];
      if (bodyHash) {
        keys.unshift(method + ' ' + abs + ' #' + bodyHash);
        keys.unshift(method + ' ' + (parsed.pathname + parsed.search) + ' #' + bodyHash);
        keys.unshift(method + ' ' + parsed.pathname + ' #' + bodyHash);
      }
      return keys;
    } catch {
      var fallback = abs ? [method + ' ' + abs, abs] : [];
      if (bodyHash && abs) fallback.unshift(method + ' ' + abs + ' #' + bodyHash);
      return fallback;
    }
  }

  function resolveKey(rawInput, init){
    var abs = resolveAbsolute(rawInput);
    if (!abs) return null;
    var method = resolveMethod(rawInput, init);
    var bodyHash = requestBodyHash(rawInput, init);
    var keys = allKeys(abs, method, bodyHash);
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(data, keys[i])) return keys[i];
    }

    function canonicalizeKey(k){
      var key = String(k || '').trim();
      var methodMatch = key.match(/^([A-Z]+)\\s+(.*)$/);
      var keyMethod = methodMatch ? methodMatch[1] : '';
      var rest = methodMatch ? methodMatch[2] : key;
      var hashPart = '';
      var hashIdx = rest.indexOf(' #');
      if (hashIdx !== -1) {
        hashPart = rest.slice(hashIdx);
        rest = rest.slice(0, hashIdx);
      }
      try {
        var u = new URL(rest, window.location.href);
        rest = u.pathname + u.search;
      } catch {}
      rest = rest.replace(/\\/+/g, '/');
      if (rest.length > 1) rest = rest.replace(/\\/+$/, '');
      return (keyMethod ? keyMethod + ' ' : '') + rest + hashPart;
    }

    var wantedCanon = keys.map(canonicalizeKey);
    for (var prop in data) {
      if (!Object.prototype.hasOwnProperty.call(data, prop)) continue;
      var propCanon = canonicalizeKey(prop);
      for (var j = 0; j < wantedCanon.length; j++) {
        if (propCanon === wantedCanon[j]) {
          return prop;
        }
      }
    }
    return null;
  }

  window.fetch = function(input, init){
    var requestedUrl = String(typeof input === 'string' ? input : (input && input.url ? input.url : input));
    var requestedMethod = resolveMethod(input, init);
    var key = resolveKey(input, init);
    if (key) {
      var stored = data[key] || {};
      var status = typeof stored.status === 'number' ? stored.status : 200;
      var statusText = typeof stored.statusText === 'string' ? stored.statusText : 'OK';
      var headers = stored.headers || { 'content-type': 'application/json' };
      var body = typeof stored.body === 'string' ? stored.body : JSON.stringify(stored.body || {});
      var localpath = stored._localpath || '(memory)';
      console.log('[AWA fetch] LOADING "' + requestedUrl + '" as "' + localpath + '" faking response (' + requestedMethod + ')');
      return Promise.resolve(new Response(body, { status: status, statusText: statusText, headers: headers }));
    }

    console.warn('[AWA fetch] MISS "' + requestedUrl + '" (' + requestedMethod + ')');
    var missPayload = JSON.stringify({ error: 'Offline fetch miss', url: requestedUrl });
    return Promise.resolve(new Response(missPayload, {
      status: 404,
      statusText: 'Not Found',
      headers: { 'content-type': 'application/json' }
    }));
  };
})();</script>\n`;

    const rewriteResourceRecordForHtml = (record, htmlPath) => {
      if (!record || typeof record !== 'object') return record;
      const headers = record.headers || {};
      const contentTypeHeader = Object.entries(headers).find(([k]) => String(k).toLowerCase() === 'content-type');
      const contentType = contentTypeHeader ? String(contentTypeHeader[1]) : '';
      if (!/json/i.test(contentType)) return record;
      if (typeof record.body !== 'string') return record;
      try {
        const parsed = JSON.parse(record.body);
        const rewritten = rewriteJsonUrlsForOffline(parsed, htmlPath);
        return { ...record, body: JSON.stringify(rewritten) };
      } catch {
        return record;
      }
    };

    // Inject stored API data into all HTML files for offline use
    setLogProgress('injecting replay data', 0, htmlPaths.length);
    for (let index = 0; index < htmlPaths.length; index++) {
      setLogProgress('injecting replay data', index + 1, htmlPaths.length);
      const htmlPath = htmlPaths[index];
      const pageResourceData = {};
      const transformedCache = new WeakMap();
      for (const [key, record] of Object.entries(resourceDataBase)) {
        let transformed = transformedCache.get(record);
        if (!transformed) {
          transformed = rewriteResourceRecordForHtml(record, htmlPath);
          transformedCache.set(record, transformed);
        }
        pageResourceData[key] = transformed;
      }

      const serializedResourceData = JSON.stringify(pageResourceData)
        .replace(/<\//g, '<\\/')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

      const pageRootBasePath = toOutRelativePath(OUT_DIR, htmlPath).replace(/\/+$/, '');
      const pageAssetBasePath = toOutRelativePath(path.join(OUT_DIR, 'assets'), htmlPath).replace(/\/+$/, '');
      let pageApiInjectionScripts = buildFetchShimScript(serializedResourceData, pageRootBasePath, pageAssetBasePath);

      for (const entry of storedApiFiles) {
        const { api, content, parsedJson } = entry;
        if (api.type === 'script') {
          pageApiInjectionScripts += `<script>${content}</script>\n`;
          continue;
        }
        if (!parsedJson) continue;
        const rewrittenParsed = rewriteJsonUrlsForOffline(parsedJson, htmlPath);
        const varName = '__' + path.basename(api.localpath, '.json').toUpperCase().replace(/-/g, '_') + '_DATA__';
        pageApiInjectionScripts += `<script>window.${varName} = JSON.parse(\`${JSON.stringify(rewrittenParsed).replace(/`/g, '\\`')}\`);</script>\n`;
      }

      if (pageApiInjectionScripts) {
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html
          .replace(/<script[^>]*src=["'][^"']*cdn\.matomo\.cloud[^"']*["'][^>]*><\/script>/gi, '')
          .replace(/g\.src\s*=\s*['"]https:\/\/cdn\.matomo\.cloud\/[^'"]+['"];?/gi, 'g.src = "";');
        const headEnd = html.indexOf('</head>');
        if (headEnd !== -1) {
          html = html.slice(0, headEnd) + pageApiInjectionScripts + html.slice(headEnd);
          fs.writeFileSync(htmlPath, html, 'utf8');
        }
      }
    }

    clearLogProgress();

    // Generic --replace support: apply all replacements in all HTML, CSS, JS files
    console.log('opts.replace:', opts.replace);
    const REPLACEMENTS = (opts.replace || []).map(pair => {
      const [from, to] = pair.split("::");
      if (from === undefined || to === undefined) {
        throw new Error("Each --replace must be in the format 'from::to'");
      }
      return { from, to };
    });
    let replacementFilesChanged = 0;
    let replacementFilesScanned = 0;
    let replacementTotalHits = 0;
    console.log('REPLACEMENTS:', REPLACEMENTS);
    if (REPLACEMENTS.length > 0) {
      const replaceInFile = (filePath) => {
        let content = fs.readFileSync(filePath, "utf8");
        const original = content;
        for (const { from, to } of REPLACEMENTS) {
          const occurrences = from ? content.split(from).length - 1 : 0;
          replacementTotalHits += occurrences;
          content = content.split(from).join(to);
        }
        replacementFilesScanned += 1;
        if (content !== original) {
          replacementFilesChanged += 1;
          fs.writeFileSync(filePath, content, "utf8");
        }
      };
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir)) {
          const entryPath = path.join(dir, entry);
          if (fs.statSync(entryPath).isDirectory()) walk(entryPath);
          else if (/\.(html?|css|js)$/i.test(entry)) replaceInFile(entryPath);
        }
      };
      walk(OUT_DIR);
      console.log(`Replacements applied:`, REPLACEMENTS.map(r => `${r.from}→${r.to}`).join(", "));
    }

    await browser.close();

    const savedAssetCount = Object.keys(assetUrlToLocal).length;
    const savedHtmlCount = htmlPaths.length;
    const savedAutoApiCount = autoApiResources.size;
    const totalSavedResources = savedAssetCount + savedHtmlCount + savedAutoApiCount + manualStoredApiCount;
    const elapsedTotal = Date.now() - processStartAt;

    console.log('');
    console.log('================ AWA SUMMARY ================');
    console.log(`Duration: ${formatDurationHuman(elapsedTotal)} (${formatElapsed(elapsedTotal)})`);
    console.log(`Pages visited: ${seen.size}`);
    console.log(`Pages processed: ${processed}`);
    if (!IGNORE_MAX && processed >= MAX_PAGES && queue.length > 0) {
      console.warn(`Max-pages limit reached (${MAX_PAGES}). ${queue.length} queued pages were not processed. Increase --max-pages or use --ignore-max.`);
    }
    console.log(`HTML files saved: ${savedHtmlCount}`);
    console.log(`API calls captured: ${totalApiCalls}`);
    console.log(`API responses stored (auto): ${savedAutoApiCount}`);
    console.log(`API responses stored (--store-api): ${manualStoredApiCount}`);
    console.log(`Assets saved: ${savedAssetCount}`);
    console.log(`Replacement rules: ${REPLACEMENTS.length}`);
    console.log(`Files scanned for replacement: ${replacementFilesScanned}`);
    console.log(`Files changed by replacement: ${replacementFilesChanged}`);
    console.log(`Replacement hits: ${replacementTotalHits}`);
    console.log(`Replacement pairs: ${REPLACEMENTS.length > 0 ? REPLACEMENTS.map(r => `${r.from}→${r.to}`).join(', ') : '(none)'}`);
    console.log(`Total resources saved: ${totalSavedResources}`);
    console.log('==============================================');
  }

  // Call main() here, inside the if block
  console.log('awa.js: About to call main()');
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}



// Map from asset URL to local asset path (relative to OUT_DIR)
const assetUrlToLocal = {};

// Helper: Rewrite URLs in CSS, HTML, and JS to local asset paths, download referenced assets

// Maintain a map of crawled page URLs to saved filenames
const pageUrlToFile = new Map();
const pageUrlToFileAllForms = new Map();

const htmlPaths = []; // Collect HTML paths for post-processing
const htmlPathToUrl = new Map(); // Map HTML path to original URL

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Export for testing
export {
  extractLinksFromHtml,
  rewriteHtmlLinks
};
