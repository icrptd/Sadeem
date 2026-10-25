// Pure Arabic text helpers (no DOM). Used by the editor and by node tests.

const HINDI = '٠١٢٣٤٥٦٧٨٩';

export const toHindiDigits = (s) => s.replace(/[0-9]/g, (d) => HINDI[+d]);

export const toWesternDigits = (s) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

export const removeTashkeel = (s) => s.replace(/[ً-ٰٟ]/g, '');
export const removeTatweel = (s) => s.replace(/ـ/g, '');
export const normalizeAlef = (s) => s.replace(/[آأإٱ]/g, 'ا');
export const normalizeYaa = (s) => s.replace(/ى/g, 'ي');
export const taaMarbutaToHaa = (s) => s.replace(/ة/g, 'ه');

// Comma inside numbers (1,000) is a thousands separator, so leave it alone.
export const arabicPunctuation = (s) =>
  s
    .replace(/(?<!\d),|,(?!\d)/g, '،')
    .replace(/\?/g, '؟')
    .replace(/;/g, '؛');

export const removeInvisible = (s) =>
  s.replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿­؜]/g, '');

// Trailing spaces and runs of inner spaces, keeping indentation.
export const cleanSpaces = (s) =>
  s.replace(/[ \t ]+$/gm, '').replace(/(\S)[  ]{2,}/g, '$1 ');

/* ---------- keyboard layout repair (Windows "Arabic (101)" layout) ---------- */

const EN_TO_AR = {
  q: 'ض', w: 'ص', e: 'ث', r: 'ق', t: 'ف', y: 'غ', u: 'ع', i: 'ه', o: 'خ', p: 'ح', '[': 'ج', ']': 'د',
  a: 'ش', s: 'س', d: 'ي', f: 'ب', g: 'ل', h: 'ا', j: 'ت', k: 'ن', l: 'م', ';': 'ك', "'": 'ط',
  z: 'ئ', x: 'ء', c: 'ؤ', v: 'ر', b: 'لا', n: 'ى', m: 'ة', ',': 'و', '.': 'ز', '/': 'ظ', '`': 'ذ',
  // Shift layer
  Q: 'َ', W: 'ً', E: 'ُ', R: 'ٌ', T: 'لإ', Y: 'إ', U: '‘', I: '÷', O: '×', P: '؛',
  A: 'ِ', S: 'ٍ', D: ']', F: '[', G: 'لأ', H: 'أ', J: 'ـ', K: '،', L: '/',
  Z: '~', X: 'ْ', C: '}', V: '{', B: 'لآ', N: 'آ', M: '’',
  '?': '؟', '<': ',', '>': '.',
};

// Reverse table: first definition wins, ligature keys are skipped so "لا" maps to "gh".
const AR_TO_EN = (() => {
  const out = {};
  const order = Object.keys(EN_TO_AR);
  for (const k of order) {
    const v = EN_TO_AR[k];
    if (v.length !== 1) continue;
    if (!(v in out)) out[v] = k;
  }
  return out;
})();

export function fixKeyboard(text, direction) {
  const map = direction === 'ar2en' ? AR_TO_EN : EN_TO_AR;
  let out = '';
  for (const ch of text) out += map[ch] !== undefined ? map[ch] : ch;
  return out;
}

/** Guess which way a piece of text was typed on the wrong layout. */
export function guessKeyboardDirection(text) {
  let ar = 0, lat = 0;
  for (const ch of text) {
    if (/[؀-ۿ]/.test(ch)) ar++;
    else if (/[A-Za-z]/.test(ch)) lat++;
  }
  return lat >= ar ? 'en2ar' : 'ar2en';
}

/* ---------- statistics ---------- */

const WORD_RE = /[\p{L}\p{N}\p{M}_]+/gu;

export function textStats(text, opts = {}) {
  const readingWpm = opts.wpm || 180;
  const words = text.match(WORD_RE) || [];
  const lines = text.length === 0 ? 0 : text.split('\n').length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const sentences = (text.match(/[^.!?؟۔…\n]+[.!?؟۔…]+/g) || []).length || (text.trim() ? 1 : 0);
  const arabicLetters = (text.match(/[ء-يٮ-ۓۺ-ۿ]/g) || []).length;
  const latinLetters = (text.match(/[A-Za-z]/g) || []).length;
  const digits = (text.match(/[0-9٠-٩۰-۹]/g) || []).length;
  const noSpaces = text.replace(/\s/g, '').length;

  const freq = new Map();
  for (const w of words) {
    const key = removeTatweel(removeTashkeel(w)).toLowerCase();
    if (key.length < 2 || /^[\p{N}_]+$/u.test(key)) continue;
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'))
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  return {
    chars: text.length,
    charsNoSpaces: noSpaces,
    words: words.length,
    lines,
    paragraphs,
    sentences,
    arabicLetters,
    latinLetters,
    digits,
    readingMinutes: words.length / readingWpm,
    top,
  };
}
