// fileUtils.test.js
import fs from 'fs';
import path from 'path';
import { removeHtmlFilesAndAssetsAndLogs } from './fileUtils.js';

// Setup test dirs/files
const testDir = 'test-out';
const assetsDir = path.join(testDir, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(testDir, 'foo.html'), 'x');
fs.writeFileSync(path.join(assetsDir, 'bar.png'), 'y');
fs.writeFileSync(path.join(testDir, 'urls.txt'), 'z');

removeHtmlFilesAndAssetsAndLogs(testDir, assetsDir);

// Check removals
console.assert(!fs.existsSync(path.join(testDir, 'foo.html')));
console.assert(!fs.existsSync(path.join(assetsDir, 'bar.png')));
console.assert(!fs.existsSync(path.join(testDir, 'urls.txt')));

// Cleanup
fs.rmSync(testDir, { recursive: true, force: true });
console.log('fileUtils tests passed.');
