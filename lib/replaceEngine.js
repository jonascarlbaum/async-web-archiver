// replaceEngine.js
import fs from 'fs';
import path from 'path';

export function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  for (const { from, to } of replacements) {
    content = content.split(from).join(to);
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

export function walkAndReplace(dir, replacements) {
  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    if (fs.statSync(entryPath).isDirectory()) walkAndReplace(entryPath, replacements);
    else if (/\.(html?|css|js)$/i.test(entry)) replaceInFile(entryPath, replacements);
  }
}
