// Pure search helpers: build a RegExp from user options and expand replacement templates.

const DIA = '\\u064B-\\u065F\\u0670\\u0640';
const DIA_RE = /[ً-ٰٟـ]/g;

const GROUPS = {
  'ا': '[اأإآٱ]',
  'أ': '[اأإآٱ]',
  'إ': '[اأإآٱ]',
  'آ': '[اأإآٱ]',
  'ٱ': '[اأإآٱ]',
  'ي': '[يى]',
  'ى': '[يى]',
  'ة': '[ةه]',
  'ه': '[هة]',
};

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {{query:string, caseSensitive?:boolean, wholeWord?:boolean, regex?:boolean, arabicFuzzy?:boolean}} o
 * @returns {{re: RegExp|null, error: string|null}}
 */
export function buildSearch(o) {
  const q = o.query || '';
  if (!q) return { re: null, error: null };
  let body;
  if (o.regex) {
    body = q;
  } else if (o.arabicFuzzy) {
    const chars = Array.from(q.replace(DIA_RE, ''));
    if (!chars.length) return { re: null, error: null };
    body = chars.map((c) => GROUPS[c] || escapeRe(c)).join(`[${DIA}]*`) + `[${DIA}]*`;
  } else {
    body = escapeRe(q);
  }
  if (o.wholeWord) {
    body = `(?<![\\p{L}\\p{N}\\p{M}_])(?:${body})(?![\\p{L}\\p{N}\\p{M}_])`;
  }
  const flags = 'gu' + (o.caseSensitive ? '' : 'i') + (o.regex ? 'm' : '');
  try {
    return { re: new RegExp(body, flags), error: null };
  } catch (e1) {
    if (o.regex && !o.wholeWord) {
      try {
        return { re: new RegExp(body, flags.replace('u', '')), error: null };
      } catch (e2) {
        return { re: null, error: String(e2.message || e2) };
      }
    }
    return { re: null, error: String(e1.message || e1) };
  }
}

/** All non-empty matches. Returns [{from,to,m}] (m is the RegExp match array). */
export function findAll(re, text, limit = 200000) {
  const out = [];
  if (!re) return out;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) && out.length < limit) {
    if (m[0].length === 0) {
      const cp = text.codePointAt(re.lastIndex);
      re.lastIndex += cp !== undefined && cp > 0xffff ? 2 : 1;
      if (re.lastIndex > text.length) break;
      continue;
    }
    out.push({ from: m.index, to: m.index + m[0].length, m });
  }
  return out;
}

/** Expand $&, $1..$99, $<name>, $$ and (in regex mode) \n \t \\ for one match. */
export function expandReplacement(m, tpl, regexMode) {
  let out = '';
  for (let i = 0; i < tpl.length; i++) {
    const c = tpl[i];
    if (c === '$' && regexMode) {
      const n = tpl[i + 1];
      if (n === '$') { out += '$'; i++; continue; }
      if (n === '&') { out += m[0]; i++; continue; }
      if (n === '<') {
        const end = tpl.indexOf('>', i + 2);
        if (end > 0 && m.groups) {
          out += m.groups[tpl.slice(i + 2, end)] ?? '';
          i = end;
          continue;
        }
      }
      if (n >= '0' && n <= '9') {
        let num = n;
        const n2 = tpl[i + 2];
        if (n2 >= '0' && n2 <= '9' && Number(n + n2) < m.length) num = n + n2;
        const idx = Number(num);
        if (idx > 0 && idx < m.length) {
          out += m[idx] ?? '';
          i += num.length;
          continue;
        }
      }
    }
    if (c === '\\' && regexMode) {
      const n = tpl[i + 1];
      if (n === 'n') { out += '\n'; i++; continue; }
      if (n === 't') { out += '\t'; i++; continue; }
      if (n === '\\') { out += '\\'; i++; continue; }
    }
    out += c;
  }
  return out;
}

/** Index of the first match starting at or after pos (wraps to 0). -1 when none. */
export function nextIndex(matches, pos) {
  if (!matches.length) return -1;
  for (let i = 0; i < matches.length; i++) if (matches[i].from >= pos) return i;
  return 0;
}

/** Index of the last match that ends at or before pos (wraps to last). -1 when none. */
export function prevIndex(matches, pos) {
  if (!matches.length) return -1;
  for (let i = matches.length - 1; i >= 0; i--) if (matches[i].to <= pos) return i;
  return matches.length - 1;
}
