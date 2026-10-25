// Number to Arabic words (تفقيط). Integers up to 999,999,999,999,999 plus optional Saudi riyal wording.

const ONES_M = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
  'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const ONES_F = ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر',
  'إحدى عشرة', 'اثنتا عشرة', 'ثلاث عشرة', 'أربع عشرة', 'خمس عشرة', 'ست عشرة', 'سبع عشرة', 'ثماني عشرة', 'تسع عشرة'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
const SCALES = [
  { s: 'ألف', d: 'ألفان', p: 'آلاف', a: 'ألفًا' },
  { s: 'مليون', d: 'مليونان', p: 'ملايين', a: 'مليونًا' },
  { s: 'مليار', d: 'ملياران', p: 'مليارات', a: 'مليارًا' },
  { s: 'تريليون', d: 'تريليونان', p: 'تريليونات', a: 'تريليونًا' },
];

function below100(n, fem) {
  const ones = fem ? ONES_F : ONES_M;
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${ones[o]} و${TENS[t]}` : TENS[t];
}

function below1000(n, fem) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (!h) return below100(r, fem);
  if (!r) return HUNDREDS[h];
  return `${HUNDREDS[h]} و${below100(r, fem)}`;
}

function groupWithScale(g, sc) {
  const h = Math.floor(g / 100);
  const r = g % 100;
  const hp = h ? HUNDREDS[h] : '';
  if (r === 0) return `${h === 2 ? 'مائتا' : hp} ${sc.s}`;
  let tail;
  if (r === 1) tail = sc.s;
  else if (r === 2) tail = sc.d;
  else if (r <= 10) tail = `${ONES_M[r]} ${sc.p}`;
  else tail = `${below100(r, false)} ${sc.a}`;
  return h ? `${hp} و${tail}` : tail;
}

/** Whole number (BigInt-safe through string) to words. */
export function tafqeetInt(value, fem = false) {
  let n = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value)));
  if (n < 0n) n = -n;
  if (n === 0n) return 'صفر';
  if (n > 999999999999999n) throw new RangeError('too large');
  const groups = [];
  while (n > 0n) {
    groups.push(Number(n % 1000n));
    n /= 1000n;
  }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    parts.push(i === 0 ? below1000(g, fem) : groupWithScale(g, SCALES[i - 1]));
  }
  return parts.join(' و');
}

export function riyalPhrase(n) {
  const num = Number(n);
  if (num === 1) return 'ريال سعودي واحد';
  if (num === 2) return 'ريالان سعوديان';
  const words = tafqeetInt(n, false);
  const r = num % 100;
  if (r >= 3 && r <= 10) return `${words} ريالات سعودية`;
  if (r >= 11) return `${words} ريالًا سعوديًا`;
  return `${words} ريال سعودي`;
}

export function halalaPhrase(h) {
  if (h === 1) return 'هللة واحدة';
  if (h === 2) return 'هللتان';
  const words = tafqeetInt(h, true);
  if (h >= 3 && h <= 10) return `${words} هللات`;
  return `${words} هللة`;
}

/** Parse "1,234.50", "١٢٣٤٫٥", "1 234" into {whole: BigInt, fraction: 0..99 (rounded to 2 places)}. */
export function parseAmount(input) {
  let s = String(input).trim();
  s = s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٬,\s ]/g, '')
    .replace(/٫/g, '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  let whole = BigInt(w);
  let fraction = Math.round(Number(`0.${f || '0'}`) * 100);
  if (fraction >= 100) {
    fraction -= 100;
    whole += 1n;
  }
  return { whole, fraction, fracDigits: f.slice(0, 15), hasFraction: f.length > 0 };
}

/**
 * @param {string|number} input
 * @param {{currency?: 'none'|'sar'}} opts
 * @returns {string|null} null when the input is not a number
 */
export function tafqeet(input, opts = {}) {
  const a = parseAmount(input);
  if (!a) return null;
  if (a.whole > 999999999999999n) return null;
  if (opts.currency === 'sar') {
    const parts = [];
    if (a.whole > 0n || a.fraction === 0) parts.push(a.whole === 0n ? 'صفر ريال' : riyalPhrase(a.whole));
    if (a.fraction > 0) parts.push(halalaPhrase(a.fraction));
    return `فقط ${parts.join(' و')} لا غير`;
  }
  const intWords = tafqeetInt(a.whole, false);
  const rest = a.fracDigits.replace(/^0+/, '');
  if (rest) {
    const zeros = a.fracDigits.length - rest.length;
    const lead = zeros ? `${'صفر '.repeat(zeros)}` : '';
    return `${intWords} فاصلة ${lead}${tafqeetInt(BigInt(rest), false)}`;
  }
  return intWords;
}
