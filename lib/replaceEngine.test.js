// replaceEngine.test.js
import fs from 'fs';
import path from 'path';
import { replaceInFile, walkAndReplace } from './replaceEngine.js';

const testDir = 'replace-test';
fs.mkdirSync(testDir, { recursive: true });
const file1 = path.join(testDir, 'a.html');
const file2 = path.join(testDir, 'b.css');
fs.writeFileSync(file1, 'foo bar foo');
fs.writeFileSync(file2, 'url(foo.png) foo');

replaceInFile(file1, [{ from: 'foo', to: 'baz' }]);
let content1 = fs.readFileSync(file1, 'utf8');
console.assert(content1 === 'baz bar baz');

walkAndReplace(testDir, [{ from: 'baz', to: 'qux' }]);
content1 = fs.readFileSync(file1, 'utf8');
let content2 = fs.readFileSync(file2, 'utf8');
console.assert(content1 === 'qux bar qux');
console.assert(content2 === 'url(foo.png) qux');

// Cleanup
fs.rmSync(testDir, { recursive: true, force: true });
console.log('replaceEngine tests passed.');
