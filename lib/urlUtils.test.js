// urlUtils.test.js
import assert from 'assert';
import path from 'path';
import {
  isInternalUrl,
  normalizeUrl,
  normalize,
  getLocalAssetPath,
  getRelativeAssetPath,
  urlToFilename
} from './urlUtils.js';

// isInternalUrl
assert.strictEqual(isInternalUrl('/foo/bar', 'intra.se'), true);
assert.strictEqual(isInternalUrl('foo/bar', 'intra.se'), true);
assert.strictEqual(isInternalUrl('https://intra.se/foo', 'intra.se'), true);
assert.strictEqual(isInternalUrl('https://google.com', 'intra.se'), false);

// normalizeUrl
assert.strictEqual(normalizeUrl('/foo/bar', 'https://intra.se'), 'https://intra.se/foo/bar');
assert.strictEqual(normalizeUrl('foo/bar', 'https://intra.se/dir/'), 'https://intra.se/dir/foo/bar');
assert.strictEqual(normalizeUrl('https://intra.se/foo', 'https://intra.se'), 'https://intra.se/foo');

// normalize
assert.strictEqual(normalize('https://intra.se/foo#bar'), 'https://intra.se/foo');

// getLocalAssetPath
assert.strictEqual(getLocalAssetPath('https://intra.se/foo/bar'), path.join('ski-output', 'foo', 'bar.html'));
assert.strictEqual(getLocalAssetPath('https://intra.se/favicon.ico'), path.join('ski-output', 'favicon.ico'));

// getRelativeAssetPath
assert.strictEqual(getRelativeAssetPath('a/b/c.html', 'a/b/d.png'), './d.png');
assert.strictEqual(getRelativeAssetPath('a/b/c.html', 'a/x/y.png'), '../x/y.png');

// urlToFilename
assert.strictEqual(urlToFilename('https://intra.se/foo'), urlToFilename('https://intra.se/foo'));

console.log('urlUtils tests passed.');
