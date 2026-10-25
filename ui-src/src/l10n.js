// Tiny language switch. The UI is Arabic by default; English is a full alternative.
let lang = 'ar';
const subs = [];

export const getLang = () => lang;
export const onLang = (fn) => subs.push(fn);

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'ar';
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  subs.forEach((f) => f(lang));
}

/** Pick the string for the current UI language. */
export const L = (ar, en) => (lang === 'ar' ? ar : en);

export const num = (n) => Number(n).toLocaleString('en-US');
