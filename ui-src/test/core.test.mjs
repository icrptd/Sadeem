import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/core/arabic.js';
import { tafqeet, tafqeetInt, parseAmount } from '../src/core/tafqeet.js';
import { buildSearch, findAll, expandReplacement, nextIndex, prevIndex } from '../src/core/search.js';
import * as T from '../src/core/textops.js';

test('digits', () => {
  assert.equal(A.toHindiDigits('عام 2026 و 10'), 'عام ٢٠٢٦ و ١٠');
  assert.equal(A.toWesternDigits('٢٠٢٦ و ۱۲۳'), '2026 و 123');
});

test('tashkeel / tatweel / normalize', () => {
  assert.equal(A.removeTashkeel('العَرَبِيَّةُ'), 'العربية');
  assert.equal(A.removeTatweel('مــرحبـا'), 'مرحبا');
  assert.equal(A.normalizeAlef('أحمد إبراهيم آمن'), 'احمد ابراهيم امن');
  assert.equal(A.normalizeYaa('على'), 'علي');
  assert.equal(A.taaMarbutaToHaa('مدرسة'), 'مدرسه');
});

test('arabic punctuation keeps number separators', () => {
  assert.equal(A.arabicPunctuation('كيف حالك? نعم, شكرا; 1,000'), 'كيف حالك؟ نعم، شكرا؛ 1,000');
});

test('invisible chars and spaces', () => {
  assert.equal(A.removeInvisible('a‏b‪c﻿'), 'abc');
  assert.equal(A.cleanSpaces('  hello   world  \n\tx  y   '), '  hello world\n\tx y');
});

test('keyboard fix', () => {
  assert.equal(A.fixKeyboard('hgsghl ugd;l', 'en2ar'), 'السلام عليكم');
  assert.equal(A.fixKeyboard('السلام عليكم', 'ar2en'), 'hgsghl ugd;l');
  assert.equal(A.fixKeyboard('b', 'en2ar'), 'لا');
  assert.equal(A.fixKeyboard('Hhmd 123', 'en2ar'), 'أاةي 123');
  assert.equal(A.guessKeyboardDirection('hgsghl'), 'en2ar');
  assert.equal(A.guessKeyboardDirection('السلام'), 'ar2en');
});

test('stats', () => {
  const s = A.textStats('مرحبا بكم في سديم. مرحبا بكم!\n\nسطر ثالث 123');
  assert.equal(s.words, 9);
  assert.equal(s.lines, 3);
  assert.equal(s.paragraphs, 2);
  assert.equal(s.top[0].count, 2);
  assert.ok(s.top.some((t) => t.word === 'مرحبا' && t.count === 2));
  assert.ok(s.arabicLetters > 10);
});

test('tafqeet ints', () => {
  const cases = {
    0: 'صفر', 1: 'واحد', 2: 'اثنان', 11: 'أحد عشر', 12: 'اثنا عشر', 20: 'عشرون', 21: 'واحد وعشرون',
    99: 'تسعة وتسعون', 100: 'مائة', 101: 'مائة وواحد', 200: 'مائتان', 345: 'ثلاثمائة وخمسة وأربعون',
    1000: 'ألف', 1001: 'ألف وواحد', 1500: 'ألف وخمسمائة', 2000: 'ألفان', 3000: 'ثلاثة آلاف',
    10000: 'عشرة آلاف', 11000: 'أحد عشر ألفًا', 21000: 'واحد وعشرون ألفًا', 100000: 'مائة ألف',
    101000: 'مائة وألف', 102000: 'مائة وألفان', 200000: 'مائتا ألف', 300000: 'ثلاثمائة ألف',
    1000000: 'مليون', 2500000: 'مليونان وخمسمائة ألف',
    1234567: 'مليون ومائتان وأربعة وثلاثون ألفًا وخمسمائة وسبعة وستون',
    1000000000: 'مليار',
  };
  for (const [n, w] of Object.entries(cases)) assert.equal(tafqeetInt(Number(n)), w, `n=${n}`);
});

test('tafqeet currency & parsing', () => {
  assert.equal(tafqeet('150', { currency: 'sar' }), 'فقط مائة وخمسون ريالًا سعوديًا لا غير');
  assert.equal(tafqeet('1', { currency: 'sar' }), 'فقط ريال سعودي واحد لا غير');
  assert.equal(tafqeet('2', { currency: 'sar' }), 'فقط ريالان سعوديان لا غير');
  assert.equal(tafqeet('5', { currency: 'sar' }), 'فقط خمسة ريالات سعودية لا غير');
  assert.equal(tafqeet('3000', { currency: 'sar' }), 'فقط ثلاثة آلاف ريال سعودي لا غير');
  assert.equal(tafqeet('١٬٢٥٠٫٥٠', { currency: 'sar' }), 'فقط ألف ومائتان وخمسون ريالًا سعوديًا وخمسون هللة لا غير');
  assert.equal(tafqeet('0.25', { currency: 'sar' }), 'فقط خمس وعشرون هللة لا غير');
  assert.equal(tafqeet('3.5'), 'ثلاثة فاصلة خمسة');
  assert.equal(tafqeet('3.05'), 'ثلاثة فاصلة صفر خمسة');
  assert.equal(tafqeet('abc'), null);
  assert.deepEqual(parseAmount('1,234.567'), { whole: 1234n, fraction: 57, fracDigits: '567', hasFraction: true });
});

test('search: plain, case, whole word', () => {
  const { re } = buildSearch({ query: 'cat' });
  assert.equal(findAll(re, 'Cat cat concat').length, 3);
  const cs = buildSearch({ query: 'cat', caseSensitive: true }).re;
  assert.equal(findAll(cs, 'Cat cat concat').length, 2);
  const ww = buildSearch({ query: 'cat', wholeWord: true }).re;
  assert.equal(findAll(ww, 'Cat cat concat cat.').length, 3);
  const arww = buildSearch({ query: 'كتاب', wholeWord: true }).re;
  assert.equal(findAll(arww, 'كتاب الكتاب كتابي كتاب').length, 2);
});

test('search: arabic fuzzy ignores tashkeel, alef and yaa variants', () => {
  const { re } = buildSearch({ query: 'العربية', arabicFuzzy: true });
  const hits = findAll(re, 'العَرَبِيَّةُ و العربيه و اللغة');
  assert.equal(hits.length, 2);
  assert.equal(findAll(buildSearch({ query: 'احمد', arabicFuzzy: true }).re, 'أحمد إحمد احمد').length, 3);
  assert.equal(findAll(buildSearch({ query: 'علي', arabicFuzzy: true }).re, 'على علي').length, 2);
  assert.equal(findAll(buildSearch({ query: 'احمد' }).re, 'أحمد احمد').length, 1);
});

test('search: regex, errors, replacement templates', () => {
  const r = buildSearch({ query: '(\\d+)-(\\d+)', regex: true });
  const m = findAll(r.re, 'a 10-20 b')[0].m;
  assert.equal(expandReplacement(m, '$2-$1 [$&] $$', true), '20-10 [10-20] $');
  assert.equal(expandReplacement(m, 'x\\ny', true), 'x\ny');
  assert.equal(expandReplacement(m, '$1\\n', false), '$1\\n');
  const bad = buildSearch({ query: '(', regex: true });
  assert.equal(bad.re, null);
  assert.ok(bad.error);
  const ml = buildSearch({ query: '^x', regex: true }).re;
  assert.equal(findAll(ml, 'x\nx\ny').length, 2);
  assert.equal(findAll(buildSearch({ query: '^', regex: true }).re, 'abc').length, 0);
});

test('search: navigation', () => {
  const ms = [{ from: 2, to: 4 }, { from: 10, to: 12 }];
  assert.equal(nextIndex(ms, 0), 0);
  assert.equal(nextIndex(ms, 5), 1);
  assert.equal(nextIndex(ms, 20), 0);
  assert.equal(prevIndex(ms, 20), 1);
  assert.equal(prevIndex(ms, 11), 0);
  assert.equal(prevIndex(ms, 1), 1);
  assert.equal(nextIndex([], 0), -1);
});

test('text ops', () => {
  assert.equal(T.sortLinesAsc('ب\nأ\nج'), 'أ\nب\nج');
  assert.equal(T.sortLinesAsc('item10\nitem2'), 'item2\nitem10');
  assert.equal(T.uniqueLines('a\nb\na\nc\nb'), 'a\nb\nc');
  assert.equal(T.removeEmptyLines('a\n\n \nb'), 'a\nb');
  assert.equal(T.collapseBlankLines('a\n\n\n\nb'), 'a\n\nb');
  assert.equal(T.reverseLines('1\n2\n3'), '3\n2\n1');
  assert.equal(T.numberLines('a\nb'), '1. a\n2. b');
  assert.equal(T.toTitle('hello wORLD'), 'Hello World');
  assert.equal(T.joinLines('a \n b\n\n c'), 'a b c');
});

test('findAll does not hang on empty regex matches with emoji (surrogate pairs)', () => {
  const { re } = buildSearch({ query: 'a*', regex: true });
  const t0 = Date.now();
  findAll(re, '🙂 emoji 😀 اختبار');
  assert.ok(Date.now() - t0 < 500);
});
