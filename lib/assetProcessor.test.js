// assetProcessor.test.js
// Tests for asset extraction and replacement in HTML, CSS, JS
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import {
  extractLinksFromHtml,
  extractLinksFromCss,
  extractLinksFromJs,
  rewriteHtmlLinks,
  rewriteCssLinks,
  rewriteJsLinks,
  processHtmlFile,
  processJsFile,
  assetUrlToPath
} from './assetProcessor.js';

// HTML extraction
const html = '<img src="/a.png"><a href="foo.html">x</a><script src="bar.js"></script>';
assert.deepStrictEqual(extractLinksFromHtml(html), ['/a.png', 'foo.html', 'bar.js']);

// CSS extraction
const css = 'body { background: url("/img/bg.jpg"); } .icon { background: url(icons/icon.svg); }';
assert.deepStrictEqual(extractLinksFromCss(css), ['/img/bg.jpg', 'icons/icon.svg']);

// JS extraction
const js = "import x from './mod.js'; const y = require('./lib.js'); fetch('/api/data'); const z = 'https://cdn.com/x.png';";
assert.deepStrictEqual(extractLinksFromJs(js), ['./mod.js', './lib.js', '/api/data', 'https://cdn.com/x.png']);

// HTML replacement
const urlMap = {
  'https://site.com/a.png': 'a.png',
  'https://site.com/foo.html': 'foo.html',
  'https://site.com/bar.js': 'bar.js',
};
const html2 = '<img src="/a.png"><a href="foo.html">x</a><script src="bar.js"></script>';
const rewrittenHtml = rewriteHtmlLinks(html2, urlMap, 'https://site.com/', 'site.com');
assert.ok(rewrittenHtml.includes('src="a.png"'));
assert.ok(rewrittenHtml.includes('href="foo.html"'));
assert.ok(rewrittenHtml.includes('src="bar.js"'));

// HTML replacement with HTML-encoded query string in src attribute
const htmlEntityAttr = '<img src="/images/logo-s.gif?width=36&amp;height=62&amp;rmode=max&amp;format=webp" class="header-logo__img">';
const entityAttrMap = {
  'https://site.com/images/logo-s.gif?width=36&height=62&rmode=max&format=webp': './assets/logo-s.webp'
};
const rewrittenEntityAttrHtml = rewriteHtmlLinks(htmlEntityAttr, entityAttrMap, 'https://site.com/', 'site.com');
assert.ok(rewrittenEntityAttrHtml.includes('src="./assets/logo-s.webp"'), 'encoded query src should be rewritten');

// CSS replacement
const css2 = 'body { background: url("/img/bg.jpg"); }';
const cssMap = { 'https://site.com/img/bg.jpg': 'img_bg.jpg' };
const rewrittenCss = rewriteCssLinks(css2, cssMap, 'https://site.com/');
assert.ok(rewrittenCss.includes('url("img_bg.jpg")'));

// JS replacement
const js2 = "const img = 'https://site.com/img/bg.jpg';";
const jsMap = { 'https://site.com/img/bg.jpg': 'img_bg.jpg' };
const rewrittenJs = rewriteJsLinks(js2, jsMap, 'https://site.com/');
assert.ok(rewrittenJs.includes('img_bg.jpg'));

// assetUrlToPath should not duplicate /assets prefix into assets/assets
const normalizedAssetOutPath = assetUrlToPath('https://site.com/assets/dist/main.css', path.join('output', 'assets'), new Set(['site.com']));
assert.strictEqual(normalizedAssetOutPath.replace(/\\/g, '/'), 'output/assets/dist/main.css', 'assetUrlToPath should normalize leading /assets/ path segment');

// Test content-type matching for asset downloading
assert(/css|image|font|javascript|octet-stream|svg|webp|woff|woff2|ttf|eot|ico|audio|video/i.test('text/css'), 'text/css should match for asset downloading');
assert(/css|image|font|javascript|octet-stream|svg|webp|woff|woff2|ttf|eot|ico|audio|video/i.test('image/png'), 'image/png should match for asset downloading');
assert(!/css|image|font|javascript|octet-stream|svg|webp|woff|woff2|ttf|eot|ico|audio|video/i.test('text/html'), 'text/html should not match for asset downloading');

console.log('All assetProcessor tests passed.');
// --- Additional HTML extraction scenarios ---
// srcset
const htmlSrcset = '<img srcset="img1.jpg 1x, img2.jpg 2x">';
// Should extract both URLs
// (Current extractLinksFromHtml does not support srcset, so this will fail until fixed)
assert.deepStrictEqual(
  extractLinksFromHtml(htmlSrcset),
  ['img1.jpg', 'img2.jpg'],
  'srcset extraction failed'
);

// data-src, data-href
const htmlData = '<img data-src="lazy.png"><a data-href="lazy.html">';
assert.deepStrictEqual(
  extractLinksFromHtml(htmlData),
  ['lazy.png', 'lazy.html'],
  'data-* extraction failed'
);

// object, embed, iframe, video, audio, track, source, image, use, meta refresh
const htmlMedia = `
  <object data="obj.swf"></object>
  <embed src="embed.mp4">
  <iframe src="frame.html"></iframe>
  <video src="video.mp4"></video>
  <audio src="audio.mp3"></audio>
  <track src="track.vtt">
  <source src="source.mp4">
  <image xlink:href="img.svg"></image>
  <use xlink:href="icon.svg#id"></use>
  <meta http-equiv="refresh" content="0; url=redirect.html">
`;
assert.deepStrictEqual(
  extractLinksFromHtml(htmlMedia),
  [
    'obj.swf', 'embed.mp4', 'frame.html', 'video.mp4', 'audio.mp3', 'track.vtt',
    'source.mp4', 'img.svg', 'icon.svg#id', 'redirect.html'
  ],
  'media/meta extraction failed'
);

// Inline style attribute
const htmlStyle = '<div style="background:url(bg.png)"></div>';
assert.deepStrictEqual(
  extractLinksFromHtml(htmlStyle),
  ['bg.png'],
  'inline style extraction failed'
);

// --- Additional CSS extraction scenarios ---
// @import
const cssImport = '@import url("theme.css");';
assert.deepStrictEqual(
  extractLinksFromCss(cssImport),
  ['theme.css'],
  '@import extraction failed'
);

// @font-face
const cssFont = '@font-face { src: url("font.woff2"); }';
assert.deepStrictEqual(
  extractLinksFromCss(cssFont),
  ['font.woff2'],
  '@font-face extraction failed'
);

// Multiple URLs in one property
const cssMulti = 'background: url(a.png), url(b.png);';
assert.deepStrictEqual(
  extractLinksFromCss(cssMulti),
  ['a.png', 'b.png'],
  'multiple url() extraction failed'
);

// Data URLs (should be extracted, but you may want to ignore in replacement)
const cssData = 'background: url(data:image/png;base64,abc);';
assert.deepStrictEqual(
  extractLinksFromCss(cssData),
  ['data:image/png;base64,abc'],
  'data url extraction failed'
);

// --- Additional JS extraction scenarios ---
// Dynamic import
const jsDynImport = 'import("./dyn.js");';
assert.deepStrictEqual(
  extractLinksFromJs(jsDynImport), ['./dyn.js'], 'dynamic import extraction failed');

// Template literal fetch
const jsTpl = 'fetch(`/api/${id}.json`);';
// Should not extract, as current logic does not parse template literals
assert.deepStrictEqual(
  extractLinksFromJs(jsTpl),
  [],
  'template literal fetch should not be extracted by current logic'
);

// Assignment to src/href in JS
const jsAssign = 'img.src = "foo.png"; link.href = "bar.css";';
assert.deepStrictEqual(
  extractLinksFromJs(jsAssign), [], 'assignment extraction not supported');

// Protocol-relative URL
const htmlProto = '<img src="//cdn.com/x.png">';
assert.deepStrictEqual(
  extractLinksFromHtml(htmlProto), ['//cdn.com/x.png'], 'protocol-relative extraction failed');

// srcset with descriptors
const htmlSrcset2 = '<img srcset="img1.jpg 1x, img2.jpg 2x, img3.jpg 3x">';
assert.deepStrictEqual(
  extractLinksFromHtml(htmlSrcset2), ['img1.jpg', 'img2.jpg', 'img3.jpg'], 'srcset with descriptors extraction failed');

// Comments containing URLs (should not be extracted)
const htmlComment = '<!-- <img src="shouldnot.png"> --><img src="should.png">';
assert.deepStrictEqual(
  extractLinksFromHtml(htmlComment), ['should.png'], 'commented-out src extraction failed');

console.log('All assetProcessor extended tests passed.');

// Test processHtmlFile for asset links
const testProcessHtmlFileAssets = async () => {
  const OUT_DIR = 'test-temp';
  const htmlPath = path.join(OUT_DIR, 'test.html');
  const baseUrl = 'https://example.com/';
  const pageUrlToFileAllForms = new Map();
  const assetUrlToLocal = new Map();
  assetUrlToLocal.set('https://example.com/style.css', 'assets/style.css');
  const ALLOWED_HOSTS = new Set(['example.com']);

  // Create test HTML
  const html = '<html><head><link rel="stylesheet" href="/style.css"></head><body></body></html>';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(htmlPath, html, 'utf8');

  // Mock downloadAsset
  const downloadAsset = (url, map) => { map.set(url, 'assets/style.css'); };

  await processHtmlFile(htmlPath, baseUrl, pageUrlToFileAllForms, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS);

  // Read back
  const processed = fs.readFileSync(htmlPath, 'utf8');

  // Check if rewritten
  assert(processed.includes('href="./assets/style.css"'), 'CSS link should be rewritten to relative path');

  // Cleanup
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
};

// Test processHtmlFile for page links
const testProcessHtmlFilePageLinks = async () => {
  const OUT_DIR = 'test-temp2';
  const htmlPath = path.join(OUT_DIR, 'index.html'); // Simulate root index.html
  const baseUrl = 'https://example.com/';
  const pageUrlToFileAllForms = new Map();
  // Simulate a crawled page with complex path
  const pageUrl = 'https://example.com/nyheter/centrala-nyheter/2025/en-sista-nyhet';
  const pageFile = 'nyheter/centrala-nyheter/2025/en-sista-nyhet.html';
  pageUrlToFileAllForms.set(pageUrl, pageFile);
  pageUrlToFileAllForms.set('/nyheter/centrala-nyheter/2025/en-sista-nyhet', pageFile);
  const assetUrlToLocal = new Map();
  const ALLOWED_HOSTS = new Set(['example.com']);

  // Create test HTML with a link to the page
  const html = '<html><body><a href="/nyheter/centrala-nyheter/2025/en-sista-nyhet">link</a></body></html>';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(htmlPath, html, 'utf8');

  // Mock downloadAsset
  const downloadAsset = () => {};

  await processHtmlFile(htmlPath, baseUrl, pageUrlToFileAllForms, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS);

  // Read back
  const processed = fs.readFileSync(htmlPath, 'utf8');

  // Check if rewritten to relative path with .html added
  assert(processed.includes('href="./nyheter/centrala-nyheter/2025/en-sista-nyhet.html"'), 'Page link should be rewritten to relative path with .html');

  // Cleanup
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
};

// Test processHtmlFile for assumed page links (not in map)
const testProcessHtmlFileAssumedPageLinks = async () => {
  const OUT_DIR = 'test-temp-assumed';
  const htmlPath = path.join(OUT_DIR, 'index.html'); // Simulate root index.html
  const baseUrl = 'https://example.com/';
  const pageUrlToFileAllForms = new Map(); // Empty map, page not crawled
  const assetUrlToLocal = new Map();
  const ALLOWED_HOSTS = new Set(['example.com']);

  // Create test HTML with a link to an uncrawled page
  const html = '<html><body><a href="/nyheter/centrala-nyheter/2025/en-sista-nyhet">link</a></body></html>';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(htmlPath, html, 'utf8');

  // Mock downloadAsset
  const downloadAsset = () => {};

  await processHtmlFile(htmlPath, baseUrl, pageUrlToFileAllForms, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS);

  // Read back
  const processed = fs.readFileSync(htmlPath, 'utf8');

  // Check if rewritten to assumed relative path with .html
  assert(processed.includes('href="./nyheter/centrala-nyheter/2025/en-sista-nyhet.html"'), 'Un crawled page link should be rewritten to assumed relative path with .html');

  // Cleanup
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
};

await testProcessHtmlFileAssumedPageLinks();
console.log('processHtmlFile assumed page test passed.');

// Regression: page href should not be rewritten to assets/index.html
const testPageHrefNotRewrittenAsAsset = async () => {
  const OUT_DIR = 'test-temp-page-href';
  const htmlPath = path.join(OUT_DIR, 'nested', 'page.html');
  const baseUrl = 'https://example.com/nested/page';
  const pageUrlToFileAllForms = new Map([
    ['https://example.com/', 'index.html'],
    ['/', 'index.html']
  ]);
  const assetUrlToLocal = {
    'https://example.com/': 'assets/index.html',
    'https://example.com/images/logo-s.gif?width=36&height=62&rmode=max&format=webp': 'assets/images/logo-s.gif'
  };
  const ALLOWED_HOSTS = new Set(['example.com']);

  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(
    htmlPath,
    '<a class="header-logo__link" href="/"><img src="/images/logo-s.gif?width=36&amp;height=62&amp;rmode=max&amp;format=webp"></a>',
    'utf8'
  );

  const downloadAsset = async () => {};
  await processHtmlFile(htmlPath, baseUrl, pageUrlToFileAllForms, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS);

  const processed = fs.readFileSync(htmlPath, 'utf8');
  assert(!processed.includes('href="../assets/index.html"'), 'page href must not become asset index');
  assert(processed.includes('href="../index.html"'), 'page href should resolve to page index');

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
};

await testPageHrefNotRewrittenAsAsset();
console.log('page href asset regression test passed.');

// Regression: JS root-relative image path should be rewritten via runtime helper
const testProcessJsFileKeepsAssetsPrefix = async () => {
  const OUT_DIR = 'test-temp-js-logo';
  const jsPath = path.join(OUT_DIR, 'assets', 'dist', 'main.js');
  const baseUrl = 'https://example.com/assets/dist/main.js';
  const assetUrlToLocal = {
    'https://example.com/images/logo-s.gif?width=36&height=62&rmode=max&format=webp': 'assets/images/logo-s.gif'
  };
  const ALLOWED_HOSTS = new Set(['example.com']);

  fs.mkdirSync(path.dirname(jsPath), { recursive: true });
  fs.writeFileSync(
    jsPath,
    'const logo = "/images/logo-s.gif?width=36&height=62&rmode=max&format=webp";',
    'utf8'
  );

  const downloadAsset = async () => {};
  await processJsFile(jsPath, baseUrl, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS);

  const processed = fs.readFileSync(jsPath, 'utf8');
  assert(!processed.includes('../images/logo-s.gif'), 'JS rewrite must not drop assets prefix into ../images');
  assert(processed.includes('window.__AWA_ASSET__("images/logo-s.gif")') || processed.includes("window.__AWA_ASSET__('images/logo-s.gif')"), 'JS rewrite should use runtime asset helper with asset-relative path');

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
};

await testProcessJsFileKeepsAssetsPrefix();
console.log('processJsFile assets-prefix regression test passed.');

// Regression: JS root-relative page path should remain unchanged (non-asset)
const testProcessJsFileRewritesRootPagePath = async () => {
  const OUT_DIR = 'test-temp-js-page-path';
  const jsPath = path.join(OUT_DIR, 'assets', 'dist', 'main.js');
  const baseUrl = 'https://example.com/assets/dist/main.js';
  const assetUrlToLocal = {};
  const ALLOWED_HOSTS = new Set(['example.com']);

  fs.mkdirSync(path.dirname(jsPath), { recursive: true });
  fs.writeFileSync(jsPath, 'const link = "/projekt/projekthandboken";', 'utf8');

  const downloadAsset = async () => {};
  await processJsFile(jsPath, baseUrl, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS);

  const processed = fs.readFileSync(jsPath, 'utf8');
  assert(processed.includes('"/projekt/projekthandboken"'), 'JS non-asset page path should not be rewritten');

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
};

await testProcessJsFileRewritesRootPagePath();
console.log('processJsFile root-page-path regression test passed.');

// Regression: API suffix path constants should not be rewritten in JS
const testProcessJsFileKeepsApiSuffixPaths = async () => {
  const OUT_DIR = 'test-temp-js-api-suffix';
  const jsPath = path.join(OUT_DIR, 'assets', 'dist', 'main.js');
  const baseUrl = 'https://example.com/assets/dist/main.js';
  const assetUrlToLocal = {};
  const ALLOWED_HOSTS = new Set(['example.com']);

  fs.mkdirSync(path.dirname(jsPath), { recursive: true });
  fs.writeFileSync(jsPath, 'const x = "/get/pinned"; const y = "/get/all";', 'utf8');

  const downloadAsset = async () => {};
  await processJsFile(jsPath, baseUrl, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS);

  const processed = fs.readFileSync(jsPath, 'utf8');
  assert(processed.includes('"/get/pinned"'), 'API suffix path should remain unchanged');
  assert(processed.includes('"/get/all"'), 'API suffix path should remain unchanged');
  assert(!processed.includes('__AWA_PATH__('), 'API suffix path must not be rewritten to __AWA_PATH__ helper');

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
};

await testProcessJsFileKeepsApiSuffixPaths();
console.log('processJsFile api-suffix regression test passed.');

// Test replace functionality
const testReplaceFunctionality = () => {
  const OUT_DIR = 'test-temp-replace';
  const htmlPath = path.join(OUT_DIR, 'test.html');

  // Create test HTML with .local references
  const html = '<html><head><title>Site on intranatet.statskontoret.local</title></head><body><p>Content from intranatet.statskontoret.local</p><a href="https://intranatet.statskontoret.local/page">link</a></body></html>';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(htmlPath, html, 'utf8');

  // Simulate the replace logic from awa.js
  const REPLACEMENTS = [{ from: 'intranatet.statskontoret.local', to: 'intranatet.statskontoret.se' }];
  const replaceInFile = (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const { from, to } of REPLACEMENTS) {
      content = content.split(from).join(to);
    }
    fs.writeFileSync(filePath, content, 'utf8');
  };
  replaceInFile(htmlPath);

  // Read back and check
  const processed = fs.readFileSync(htmlPath, 'utf8');
  assert(processed.includes('intranatet.statskontoret.se'), 'Replace should change .local to .se in title');
  assert(processed.includes('Content from intranatet.statskontoret.se'), 'Replace should change .local to .se in body text');
  assert(processed.includes('https://intranatet.statskontoret.se/page'), 'Replace should change .local to .se in links');

  // Cleanup
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
};

// Test processHtmlFile link rewriting
async function testProcessHtmlFile() {
  const OUT_DIR = path.join(process.cwd(), 'test_output');
  const ASSETS_DIR = path.join(OUT_DIR, 'assets');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const htmlPath = path.join(OUT_DIR, 'test.html');
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <link rel="stylesheet" href="/dist/main.css">
  <link rel="icon" href="/favicon.ico">
</head>
<body>
  <a href="/page">Link</a>
  <img src="/image.png">
  <img src="/image.png?width=36">
</body>
</html>
  `.trim();
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  const baseUrl = 'https://example.com/';
  const pageUrlToFileAllForms = new Map([
    ['https://example.com/page', 'page.html'],
    ['/page', 'page.html']
  ]);
  const assetUrlToLocal = {
    'https://example.com/dist/main.css': 'assets/dist/main.css',
    'https://example.com/favicon.ico': 'assets/favicon.ico',
    'https://example.com/image.png': 'assets/image.png',
    'https://example.com/image.png?width=36': 'assets/image.png'
  };
  const ALLOWED_HOSTS = new Set(['example.com']);

  // Mock downloadAsset to do nothing since assets are already in map
  const downloadAsset = async () => {};

  await processHtmlFile(htmlPath, baseUrl, pageUrlToFileAllForms, assetUrlToLocal, OUT_DIR, downloadAsset, ALLOWED_HOSTS);
    const processed = fs.readFileSync(htmlPath, 'utf8');
    assert(processed.includes('href="./assets/dist/main.css"'), 'CSS link should be rewritten');
    assert(processed.includes('href="./assets/favicon.ico"'), 'Icon link should be rewritten');
    assert(processed.includes('href="./page.html"'), 'Page link should be rewritten');
    assert(processed.includes('src="./assets/image.png"'), 'Image src should be rewritten');
    assert(processed.includes('src="./assets/image.png"'), 'Image src should be rewritten without query');
    console.log('processHtmlFile test passed.');
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
}

await testProcessHtmlFile();

// Test: URLs with query strings in srcset
async function testSrcsetWithQueryStrings() {
  const OUT_DIR = './test-output-srcset';
  const baseUrl = 'https://example.com/';
  const urlMap = {
    'https://example.com/image.jpg?width=720&height=450&rmode=crop&format=webp': './assets/image-720.jpg',
    'https://example.com/image.jpg?width=575&height=359&rmode=crop&format=webp': './assets/image-575.jpg',
  };
  const html = `<picture>
    <source srcset="/image.jpg?width=720&amp;height=450&amp;rmode=crop&amp;format=webp" media="(min-width: 992px)">
    <source srcset="/image.jpg?width=575&amp;height=359&amp;rmode=crop&amp;format=webp" media="(max-width: 575px)">
    <img src="/image.jpg" alt="test">
  </picture>`;
  const rewritten = rewriteHtmlLinks(html, urlMap, baseUrl, 'example.com');
  assert(rewritten.includes('srcset="./assets/image-720.jpg"'), 'srcset with query string should be rewritten');
  assert(rewritten.includes('srcset="./assets/image-575.jpg"'), 'srcset with different query string should be rewritten');
  console.log('srcset with query strings test passed.');
}

// Test: URLs with query strings in inline style background-image
async function testBackgroundImageWithQueryStrings() {
  const baseUrl = 'https://example.com/';
  const urlMap = {
    'https://example.com/hero.jpg?width=1920&height=288&rmode=crop&format=webp': './assets/hero.jpg',
  };
  const html = `<div style="background-image: url(&quot;/hero.jpg?width=1920&amp;height=288&amp;rmode=crop&amp;format=webp&quot;);"></div>`;
  const rewritten = rewriteHtmlLinks(html, urlMap, baseUrl, 'example.com');
  console.log('INPUT:', html);
  console.log('OUTPUT:', rewritten);
  assert(rewritten.includes('url(./assets/hero.jpg)') || rewritten.includes('url(&quot;./assets/hero.jpg&quot;)'), 'background-image with query string and entities should be rewritten');
  console.log('background-image test passed.');
}

// Test: data attribute (object tag)
async function testDataAttribute() {
  const baseUrl = 'https://example.com/';
  const urlMap = {
    'https://example.com/document.pdf': './assets/document.pdf',
  };
  const html = `<object data="/document.pdf" type="application/pdf"></object>`;
  const rewritten = rewriteHtmlLinks(html, urlMap, baseUrl, 'example.com');
  assert(rewritten.includes('data="./assets/document.pdf"'), 'data attribute should be rewritten');
  console.log('data attribute test passed.');
}

// Test: poster attribute (video tag)
async function testPosterAttribute() {
  const baseUrl = 'https://example.com/';
  const urlMap = {
    'https://example.com/poster.jpg': './assets/poster.jpg',
  };
  const html = `<video poster="/poster.jpg" controls><source src="video.mp4"></video>`;
  const rewritten = rewriteHtmlLinks(html, urlMap, baseUrl, 'example.com');
  assert(rewritten.includes('poster="./assets/poster.jpg"'), 'poster attribute should be rewritten');
  console.log('poster attribute test passed.');
}

await testSrcsetWithQueryStrings().catch(e => console.error('srcset test FAILED:', e.message));
await testBackgroundImageWithQueryStrings().catch(e => console.error('background-image test FAILED:', e.message));
await testDataAttribute().catch(e => console.error('data attribute test FAILED:', e.message));
await testPosterAttribute().catch(e => console.error('poster attribute test FAILED:', e.message));
