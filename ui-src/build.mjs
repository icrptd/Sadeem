import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve('..', 'ui');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: 'chrome100', outfile: path.join(out, 'app.js'), logLevel: 'info' });
for (const f of fs.readdirSync('static')) fs.copyFileSync(path.join('static', f), path.join(out, f));
for (const f of ['icon.ico', 'doc.ico']) { const src = path.join('..', f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f)); }
const fams = [
  ['ibm-plex-sans-arabic', 'IBM Plex Sans Arabic', [400, 500, 600, 700]],
  ['noto-naskh-arabic', 'Noto Naskh Arabic', [400, 700]],
  ['amiri', 'Amiri', [400, 700]],
  ['tajawal', 'Tajawal', [400, 500, 700]],
  ['cairo', 'Cairo', [400, 600, 700]],
  ['ibm-plex-mono', 'IBM Plex Mono', [400, 500]],
];
const ranges = { arabic: 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F,U+2010-2011,U+25CC', latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' };
let css = '';
for (const [pkg, name, weights] of fams) {
  const dir = path.join('node_modules', '@fontsource', pkg, 'files');
  for (const w of weights) for (const sub of ['arabic', 'latin']) {
    const file = `${pkg}-${sub}-${w}-normal.woff2`;
    if (!fs.existsSync(path.join(dir, file))) continue;
    fs.copyFileSync(path.join(dir, file), path.join(out, 'fonts', file));
    css += `@font-face{font-family:'${name}';font-style:normal;font-display:swap;font-weight:${w};src:url(fonts/${file}) format('woff2');unicode-range:${ranges[sub]}}\n`;
  }
}
fs.writeFileSync(path.join(out, 'fonts.css'), css);
console.log('fonts:', fs.readdirSync(path.join(out, 'fonts')).length);
