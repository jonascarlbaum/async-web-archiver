// fileUtils.js
import fs, { rmSync, readdirSync, statSync } from 'fs';
import path from 'path';

export function removeHtmlFilesAndAssetsAndLogs(outDir, assetsDir) {
  // Remove all .html files in outDir
  for (const file of readdirSync(outDir)) {
    if (file.endsWith('.html')) {
      try { fs.unlinkSync(path.join(outDir, file)); } catch {}
    }
  }
  // Remove all files/folders in assetsDir
  if (fs.existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir)) {
      const entryPath = path.join(assetsDir, entry);
      if (statSync(entryPath).isDirectory()) {
        rmSync(entryPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(entryPath);
      }
    }
  }
  // Remove urls.txt, errors.log, sitemap.xml if they exist
  for (const logFile of ['urls.txt', 'errors.log', 'sitemap.xml']) {
    const logPath = path.join(outDir, logFile);
    if (fs.existsSync(logPath)) {
      try { fs.unlinkSync(logPath); } catch {}
    }
  }
}
