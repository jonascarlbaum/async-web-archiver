// assetManager.test.js
import path from 'path';
import { assetUrlToPath } from './assetManager.js';

const ASSETS_DIR = 'assets-test';

// assetUrlToPath
const url1 = 'https://site.com/foo/bar.png';
const url2 = 'https://site.com/foo/bar';
const url3 = 'https://site.com/favicon.ico';

console.assert(assetUrlToPath(url1, ASSETS_DIR).endsWith(path.join(ASSETS_DIR, 'foo_bar.png')));
console.assert(assetUrlToPath(url2, ASSETS_DIR).endsWith(path.join(ASSETS_DIR, 'foo_bar')));
console.assert(assetUrlToPath(url3, ASSETS_DIR).endsWith(path.join(ASSETS_DIR, 'favicon.ico')));

console.log('assetManager tests passed.');
