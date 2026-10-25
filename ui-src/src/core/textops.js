// Pure line/case operations on strings. Every function takes text and returns text.

const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

export const sortLinesAsc = (t) => t.split('\n').sort((a, b) => collator.compare(a, b)).join('\n');
export const sortLinesDesc = (t) => t.split('\n').sort((a, b) => collator.compare(b, a)).join('\n');
export const reverseLines = (t) => t.split('\n').reverse().join('\n');
export const removeEmptyLines = (t) => t.split('\n').filter((l) => l.trim() !== '').join('\n');
export const collapseBlankLines = (t) => t.replace(/\n{3,}/g, '\n\n');
export const trimTrailing = (t) => t.replace(/[ \t]+$/gm, '');
export const trimLeading = (t) => t.replace(/^[ \t]+/gm, '');

export function uniqueLines(t) {
  const seen = new Set();
  const out = [];
  for (const l of t.split('\n')) {
    if (seen.has(l)) continue;
    seen.add(l);
    out.push(l);
  }
  return out.join('\n');
}

export const joinLines = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean).join(' ');

export function numberLines(t) {
  const lines = t.split('\n');
  const w = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(w, '0')}. ${l}`).join('\n');
}

export const toUpper = (t) => t.toUpperCase();
export const toLower = (t) => t.toLowerCase();
export const toTitle = (t) => t.toLowerCase().replace(/(^|[\s\-_(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

export const toggleCase = (t) =>
  Array.from(t).map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');

export const wrapQuotes = (t) => `«${t}»`;
