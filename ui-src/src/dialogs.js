// Dialogs: settings, statistics, tafqeet, go-to-line, encoding, shortcuts, about and the command palette.
import { ctx, ENCODINGS, EOLS, encLabel } from './ctx.js';
import { L, num } from './l10n.js';
import { h, modal, promptDialog, switchEl, segmented, selectEl, rangeEl, row, icon, toast } from './ui.js';
import { textStats, removeTashkeel } from './core/arabic.js';
import { tafqeet } from './core/tafqeet.js';
import { MODES } from './languages.js';
import { insertAtSelection } from './editor.js';

const THEMES = [
  { id: 'nebula', ar: 'سديم', en: 'Nebula', bg: '#100d1c', c1: '#ff5fa2', c2: '#8b7bff' },
  { id: 'amoled', ar: 'أسود', en: 'AMOLED', bg: '#000000', c1: '#ff5fa2', c2: '#8b7bff' },
  { id: 'dawn', ar: 'فجر', en: 'Dawn', bg: '#fbf9fe', c1: '#d6277a', c2: '#6d4fe0' },
  { id: 'paper', ar: 'ورق', en: 'Paper', bg: '#f6edda', c1: '#b83a6a', c2: '#6f52b8' },
  { id: 'system', ar: 'النظام', en: 'System', bg: 'linear-gradient(135deg,#100d1c 50%,#fbf9fe 50%)', c1: '#ff5fa2', c2: '#8b7bff' },
];
const ACCENTS = [
  ['rose', '#ff5fa2'], ['violet', '#a291ff'], ['cyan', '#3fdcd8'], ['amber', '#ffb547'], ['green', '#5be39a'], ['blue', '#5aa9ff'],
];

const set = (k, v) => ctx.app.setSetting(k, v);

/* ---------- settings ---------- */
export function showSettings() {
  const S = ctx.S;
  const themes = h('div.themes');
  const renderThemes = () => {
    themes.replaceChildren(...THEMES.map((t) => h('button.tcard', {
      type: 'button', 'aria-pressed': String(S.theme === t.id), title: L(t.ar, t.en),
      on: { click: () => { set('theme', t.id); renderThemes(); } },
    }, h('div.pv', { style: { background: t.bg, '--c1': t.c1, '--c2': t.c2 } }), L(t.ar, t.en))));
  };
  renderThemes();

  const swatches = h('div.swatches');
  const renderSwatches = () => {
    swatches.replaceChildren(...ACCENTS.map(([id, c]) => h('button.swatch', {
      type: 'button', title: id, style: { background: c }, 'aria-pressed': String(S.accent === id),
      on: { click: () => { set('accent', id); renderSwatches(); } },
    })));
  };
  renderSwatches();

  const fontSel = selectEl([
    { value: 'plex', label: 'IBM Plex Sans Arabic' },
    { value: 'naskh', label: L('نسخ (Noto Naskh)', 'Naskh (Noto Naskh)') },
    { value: 'amiri', label: L('أميري', 'Amiri') },
    { value: 'tajawal', label: L('تجوال', 'Tajawal') },
    { value: 'cairo', label: L('القاهرة', 'Cairo') },
    { value: 'mono', label: L('أحادي المسافة (Consolas)', 'Monospace (Consolas)') },
    { value: 'system', label: 'Segoe UI' },
  ], S.font, (v) => set('font', v));
  const customFont = h('input.field', {
    type: 'text', value: S.customFont || '', placeholder: 'Cascadia Code', spellcheck: false, style: { width: '190px' },
    on: { change: (e) => set('customFont', e.target.value.trim()) },
  });
  const autosaveSeconds = h('input.field', {
    type: 'number', min: 5, max: 600, value: S.autosaveSeconds, style: { width: '84px' },
    on: { change: (e) => set('autosaveSeconds', Math.max(5, Math.min(600, Number(e.target.value) || 30))) },
  });

  const body = h('div',
    h('div.sect', h('h3', L('المظهر', 'APPEARANCE')),
      row(L('اللغة', 'Language'), null, segmented([{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }], S.lang, (v) => set('lang', v))),
      h('div', { style: { marginTop: '8px' } }, themes),
      row(L('لون التمييز', 'Accent color'), null, swatches)),
    h('div.sect', h('h3', L('المحرر', 'EDITOR')),
      row(L('الخط', 'Font'), null, fontSel),
      row(L('خط مخصص', 'Custom font'), L('اسم خط مثبّت على جهازك، يُستخدم قبل الخط أعلاه', 'A font installed on your PC, used before the font above'), customFont),
      row(L('حجم الخط', 'Font size'), null, rangeEl({ min: 11, max: 48, value: S.fontSize, fmt: (v) => v + 'px', onChange: (v) => set('fontSize', v) })),
      row(L('تباعد الأسطر', 'Line height'), null, rangeEl({ min: 1.2, max: 2.8, step: 0.1, value: S.lineHeight, fmt: (v) => v.toFixed(1), onChange: (v) => set('lineHeight', Math.round(v * 10) / 10) })),
      row(L('اتجاه النص', 'Text direction'), L('تلقائي: كل سطر يأخذ اتجاه أول حرف فيه', 'Auto: each line follows its first strong letter'),
        segmented([{ value: 'auto', label: L('تلقائي', 'Auto') }, { value: 'rtl', label: L('يمين←يسار', 'RTL') }, { value: 'ltr', label: L('يسار←يمين', 'LTR') }], S.textDir, (v) => set('textDir', v))),
      row(L('التفاف الأسطر', 'Word wrap'), null, switchEl(S.wrap, (v) => set('wrap', v))),
      row(L('أرقام الأسطر', 'Line numbers'), null, switchEl(S.lineNumbers, (v) => set('lineNumbers', v))),
      row(L('تمييز السطر الحالي', 'Highlight current line'), null, switchEl(S.highlightLine, (v) => set('highlightLine', v))),
      row(L('إظهار المسافات والجداول', 'Show whitespace'), null, switchEl(S.showWhitespace, (v) => set('showWhitespace', v))),
      row(L('إغلاق الأقواس تلقائيًا', 'Auto-close brackets'), null, switchEl(S.autoBrackets, (v) => set('autoBrackets', v))),
      row(L('التدقيق الإملائي', 'Spell check'), L('يعتمد على قواميس النظام', 'Uses your system dictionaries'), switchEl(S.spellcheck, (v) => set('spellcheck', v))),
      row(L('عرض مفتاح Tab', 'Tab width'), null, segmented([2, 4, 8].map((n) => ({ value: n, label: String(n) })), S.tabSize, (v) => set('tabSize', v))),
      row(L('المفتاح Tab يدخل', 'Tab inserts'), null, segmented([{ value: false, label: L('جدول', 'Tab') }, { value: true, label: L('مسافات', 'Spaces') }], S.useSpaces, (v) => set('useSpaces', v)))),
    h('div.sect', h('h3', L('الملفات', 'FILES')),
      row(L('ترميز الملفات الجديدة', 'Encoding for new files'), null, selectEl(ENCODINGS.map((e) => ({ value: e.id, label: e.label })), S.defaultEncoding, (v) => set('defaultEncoding', v))),
      row(L('نهاية السطر للملفات الجديدة', 'Line endings for new files'), null, segmented([{ value: 'crlf', label: 'CRLF' }, { value: 'lf', label: 'LF' }], S.defaultEol, (v) => set('defaultEol', v))),
      row(L('حذف المسافات الزائدة عند الحفظ', 'Trim trailing spaces on save'), null, switchEl(S.trimOnSave, (v) => set('trimOnSave', v))),
      row(L('سطر فارغ في نهاية الملف', 'Ensure final newline'), null, switchEl(S.finalNewline, (v) => set('finalNewline', v))),
      row(L('حفظ تلقائي', 'Auto-save'), L('للملفات المحفوظة على القرص فقط', 'Only for files that already have a path'),
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
          segmented([{ value: 'off', label: L('إيقاف', 'Off') }, { value: 'delay', label: L('كل', 'Every') }], S.autosave, (v) => set('autosave', v)),
          autosaveSeconds, h('span', { style: { color: 'var(--muted)' } }, L('ث', 's')))),
      row(L('تحديث الملف تلقائيًا عند تغيّره خارج سديم', 'Reload files changed outside Sadeem'), L('لا يطبق على ملف فيه تعديلات غير محفوظة', 'Never applied to files with unsaved edits'), switchEl(S.autoReload, (v) => set('autoReload', v))),
      row(L('استعادة التبويبات عند الفتح', 'Restore tabs on start'), L('تشمل النصوص غير المحفوظة', 'Includes unsaved text'), switchEl(S.restoreSession, (v) => set('restoreSession', v))),
      row(L('تأكيد قبل الخروج مع تعديلات غير محفوظة', 'Confirm exit with unsaved changes'), null, switchEl(S.askBeforeExit, (v) => set('askBeforeExit', v))),
      row(L('إبقاء النافذة فوق النوافذ الأخرى', 'Keep window on top'), null, switchEl(S.alwaysOnTop, (v) => set('alwaysOnTop', v))),
      row(L('شريط الحالة', 'Status bar'), null, switchEl(S.statusBar, (v) => set('statusBar', v)))),
    h('div.sect', h('h3', L('البيانات', 'DATA')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button.btn', { type: 'button', on: { click: () => ctx.app.openDataFolder() } }, L('فتح مجلد البيانات', 'Open data folder')),
        h('button.btn.danger', { type: 'button', on: { click: () => ctx.app.resetSettings() } }, L('إعادة الإعدادات الافتراضية', 'Reset settings')))));

  modal({ title: L('الإعدادات', 'Settings'), body, width: 660, buttons: [{ label: L('تم', 'Done'), primary: true, value: true }] });
}

/* ---------- statistics ---------- */
export function showStats() {
  const view = ctx.view;
  const sel = view.state.selection.ranges.filter((r) => !r.empty).map((r) => view.state.sliceDoc(r.from, r.to)).join('\n');
  const scope = sel ? 'sel' : 'doc';
  const text = sel || view.state.doc.toString();
  const s = textStats(text);
  const mins = s.readingMinutes;
  const reading = s.words === 0 ? '—' : mins < 1 ? L('أقل من دقيقة', '< 1 min') : L(`${Math.ceil(mins)} دقيقة`, `${Math.ceil(mins)} min`);
  const card = (v, label) => h('div.stat', h('b', typeof v === 'number' ? num(v) : v), h('span', label));
  const max = s.top.length ? s.top[0].count : 1;
  const body = h('div',
    h('p', scope === 'sel' ? L('إحصائيات النص المحدد', 'Statistics for the selection') : L('إحصائيات المستند كاملًا', 'Statistics for the whole document')),
    h('div.statgrid',
      card(s.words, L('كلمة', 'words')), card(s.chars, L('حرف', 'characters')), card(s.charsNoSpaces, L('حرف بدون مسافات', 'without spaces')),
      card(s.lines, L('سطر', 'lines')), card(s.paragraphs, L('فقرة', 'paragraphs')), card(s.sentences, L('جملة', 'sentences')),
      card(s.arabicLetters, L('حرف عربي', 'Arabic letters')), card(s.latinLetters, L('حرف لاتيني', 'Latin letters')), card(reading, L('زمن القراءة', 'reading time'))),
    s.top.length ? h('div', h('label.lbl', L('أكثر الكلمات تكرارًا', 'Most frequent words')),
      h('div.topwords', s.top.map((t) => h('div.tw', h('span', t.word), h('div.bar', { style: { width: Math.max(6, (t.count / max) * 100) + '%' } }), h('span', num(t.count)))))) : null);
  modal({ title: L('إحصائيات النص', 'Text statistics'), body, width: 560, buttons: [{ label: L('إغلاق', 'Close'), primary: true, value: true }] });
}

/* ---------- tafqeet ---------- */
export function showTafqeet() {
  const view = ctx.view;
  const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to).trim();
  const input = h('input.field', { type: 'text', value: /^[\d٠-٩۰-۹.,٫٬\s]+$/.test(sel) ? sel : '', placeholder: L('اكتب رقمًا، مثل 1250.50', 'Type a number, e.g. 1250.50'), spellcheck: false, autocomplete: 'off', style: { direction: 'ltr', textAlign: 'start' } });
  const result = h('div.result.selectable', { dir: 'rtl' });
  let currency = ctx.S.tafqeetCurrency || 'sar';
  const update = () => {
    const w = tafqeet(input.value, { currency });
    result.classList.toggle('empty', !w);
    result.textContent = w || L('أدخل رقمًا صحيحًا (حتى 15 خانة)', 'Enter a valid number (up to 15 digits)');
  };
  input.addEventListener('input', update);
  const seg = segmented([
    { value: 'sar', label: L('ريال سعودي', 'Saudi riyal') },
    { value: 'none', label: L('بدون عملة', 'No currency') },
  ], currency, (v) => { currency = v; set('tafqeetCurrency', v); update(); });
  update();
  const answer = () => (tafqeet(input.value, { currency }) || '');
  modal({
    title: L('تفقيط الأرقام', 'Number to words'),
    width: 560,
    body: h('div', h('label.lbl', { style: { marginTop: 0 } }, L('الرقم', 'Number')), input, h('div', { style: { marginTop: '10px' } }, seg), result),
    buttons: [
      { label: L('إدراج', 'Insert'), primary: true, onClick: () => { const w = answer(); if (!w) return false; const sel0 = view.state.selection.main; view.dispatch({ selection: { anchor: sel0.to } }); insertAtSelection(view, (sel0.empty ? '' : ' ') + w); return true; } },
      { label: L('استبدال التحديد', 'Replace selection'), onClick: () => { const w = answer(); if (!w) return false; insertAtSelection(view, w); return true; } },
      { label: L('نسخ', 'Copy'), keep: true, onClick: async () => { const w = answer(); if (!w) return false; try { await navigator.clipboard.writeText(w); toast(L('تم النسخ', 'Copied')); } catch (e) { toast(L('تعذر النسخ، حدّد النص وانسخه', 'Copy failed, select the text manually'), { error: true }); } return false; } },
      { label: L('إغلاق', 'Close'), value: null },
    ],
  });
}

/* ---------- go to line ---------- */
export async function showGoto() {
  const view = ctx.view;
  const total = view.state.doc.lines;
  const cur = view.state.doc.lineAt(view.state.selection.main.head).number;
  const v = await promptDialog({
    title: L('الانتقال إلى سطر', 'Go to line'),
    label: L(`رقم السطر (1 – ${num(total)})، أو سطر:عمود مثل 12:5`, `Line number (1 – ${num(total)}), or line:column like 12:5`),
    value: String(cur),
    okLabel: L('انتقال', 'Go'),
    validate: (s) => (/^\s*\d+\s*(:\s*\d+)?\s*$/.test(s) ? null : L('اكتب رقمًا صحيحًا', 'Enter a valid number')),
  });
  if (v === null) return;
  const [a, b] = v.split(':').map((x) => parseInt(x, 10));
  const ln = Math.max(1, Math.min(total, a || 1));
  const line = view.state.doc.line(ln);
  const col = Math.max(1, b || 1);
  const pos = Math.min(line.to, line.from + col - 1);
  view.dispatch({ selection: { anchor: pos }, effects: ctx.app.scrollEffect(pos), userEvent: 'select' });
  view.focus();
}

/* ---------- pick lists ---------- */
function pickList({ title, items, current, width = 420, extraButtons = [] }) {
  let chosen = current;
  let mctx = null;
  const list = h('div.list-pick');
  const render = () => {
    list.replaceChildren(...items.map((it) => h('button', {
      type: 'button', 'aria-pressed': String(chosen === it.value),
      on: { click: () => { chosen = it.value; render(); }, dblclick: () => { chosen = it.value; if (mctx) mctx.close(chosen); } },
    }, h('span', it.label), it.hint ? h('span', { style: { color: 'var(--faint)', fontSize: '12px' } }, it.hint) : null)));
  };
  render();
  const m = mctx = modal({
    title, body: list, width,
    buttons: [
      { label: L('موافق', 'OK'), primary: true, onClick: (c) => { c.close(chosen); return false; }, keep: true },
      ...extraButtons.map((b) => ({ label: b.label, keep: true, onClick: (c) => { c.close({ action: b.action, value: chosen }); return false; } })),
      { label: L('إلغاء', 'Cancel'), value: null },
    ],
  });
  return m.promise;
}

export async function showEncoding() {
  const d = ctx.cur;
  const r = await pickList({
    title: L('ترميز الملف', 'File encoding'),
    items: ENCODINGS.map((e) => ({ value: e.id, label: e.label })),
    current: d.encoding,
    width: 460,
    extraButtons: d.path ? [{ label: L('إعادة فتح بهذا الترميز', 'Reopen with encoding'), action: 'reopen' }] : [],
  });
  if (!r) return;
  if (typeof r === 'string') ctx.app.setDocEncoding(d, r);
  else if (r.action === 'reopen') ctx.app.reopenWithEncoding(d, r.value);
}

export async function showEol() {
  const d = ctx.cur;
  const r = await pickList({
    title: L('نهاية السطر', 'Line endings'),
    items: EOLS.map((e) => ({ value: e.id, label: e.label })),
    current: d.eol, width: 380,
  });
  if (r) ctx.app.setDocEol(d, r);
}

export async function showModePicker() {
  const d = ctx.cur;
  const r = await pickList({
    title: L('نوع النص (تلوين الصياغة)', 'Language mode'),
    items: MODES.map((m) => ({ value: m.id, label: L(m.ar, m.en), hint: m.exts.slice(0, 3).map((e) => '.' + e).join(' ') })),
    current: d.mode, width: 420,
  });
  if (r) ctx.app.setDocMode(d, r);
}

/* ---------- shortcuts ---------- */
export function showShortcuts() {
  const filter = h('input.field', { type: 'text', placeholder: L('ابحث في الاختصارات…', 'Search shortcuts…'), spellcheck: false, style: { marginBottom: '12px' } });
  const box = h('div');
  const render = () => {
    const q = filter.value.trim().toLowerCase();
    const groups = new Map();
    for (const c of ctx.cmds.values()) {
      if (!c.keys.length && !c.nativeKeys) continue;
      const title = L(c.ar, c.en);
      const key = c.keys[0] || c.nativeKeys;
      if (q && !(title.toLowerCase().includes(q) || c.en.toLowerCase().includes(q) || key.toLowerCase().includes(q))) continue;
      const g = L(c.group.ar, c.group.en);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push([title, key]);
    }
    box.replaceChildren(...[...groups].map(([g, rows]) => h('div.sect', h('h3', g),
      h('div.keys', rows.flatMap(([t, k]) => [h('span.kt', t), h('kbd', k)])))));
    if (!groups.size) box.replaceChildren(h('div.empty-note', L('لا نتائج', 'No results')));
  };
  filter.addEventListener('input', render);
  render();
  modal({ title: L('اختصارات لوحة المفاتيح', 'Keyboard shortcuts'), body: h('div', filter, box), width: 620, buttons: [{ label: L('إغلاق', 'Close'), primary: true, value: true }] });
}

/* ---------- about ---------- */
export function showAbout() {
  const body = h('div.about',
    h('img', { src: 'logo.svg', alt: '' }),
    h('div', h('h3', L('سديم', 'Sadeem'))),
    h('div.fam', L('محرر نصوص عربي', 'An Arabic-first text editor')),
    h('p', { style: { marginTop: '14px' } }, L('جزء من عائلة فلك، مع سحاب ونجم ونيزك وشفق وسهيل.', 'Part of the Falak family, alongside Sahab, Najm, Nayzak, Shafaq and Suhail.')),
    h('p', L(`الإصدار ${ctx.version}`, `Version ${ctx.version}`)),
    h('p', L('تطوير: Rami Almalki', 'By Rami Almalki')));
  modal({ title: L('عن سديم', 'About Sadeem'), body, width: 420, buttons: [{ label: L('إغلاق', 'Close'), primary: true, value: true }] });
}

/* ---------- command palette ---------- */
function normalize(s) {
  return removeTashkeel(String(s)).toLowerCase();
}

export function showPalette() {
  const items = [];
  for (const c of ctx.cmds.values()) {
    if (c.hidden) continue;
    const enabled = c.enabled ? c.enabled() : true;
    if (!enabled) continue;
    items.push({
      title: L(c.ar, c.en), group: L(c.group.ar, c.group.en), keys: c.keys[0] || c.nativeKeys || '',
      hay: normalize(c.ar + ' ' + c.en + ' ' + c.id + ' ' + c.group.ar + ' ' + c.group.en), run: () => c.run(),
    });
  }
  for (const t of ctx.app.listTabs()) {
    items.push({ title: t.name, group: L('تبويب', 'Tab'), keys: '', hay: normalize(t.name + ' ' + (t.path || '') + ' tab تبويب'), run: () => ctx.app.activate(t.doc) });
  }
  for (const r of (ctx.S.recent || []).slice(0, 12)) {
    const name = r.split(/[\\/]/).pop();
    items.push({ title: name, group: L('ملف أخير', 'Recent'), keys: '', hay: normalize(r + ' recent أخير فتح'), run: () => ctx.app.openPaths([r]) });
  }

  const input = h('input', { type: 'text', placeholder: L('اكتب أمرًا أو اسم تبويب أو ملف…', 'Type a command, tab or file…'), spellcheck: false, autocomplete: 'off' });
  const list = h('div.list');
  let shown = [];
  let hot = 0;

  const render = () => {
    const tokens = normalize(input.value).split(/\s+/).filter(Boolean);
    shown = items
      .map((it) => {
        let score = 0;
        for (const tk of tokens) {
          const i = it.hay.indexOf(tk);
          if (i < 0) return null;
          score += i;
        }
        return { it, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, 60)
      .map((x) => x.it);
    hot = Math.min(hot, Math.max(0, shown.length - 1));
    list.replaceChildren(...(shown.length ? shown.map((it, i) => {
      const el = h('div.pitem', { class: i === hot ? 'hot' : '', on: { mousemove: () => { hot = i; paint(); }, click: () => choose(i) } },
        h('span.g', it.group), h('span.t', it.title), it.keys ? h('kbd', it.keys) : null);
      return el;
    }) : [h('div.empty-note', L('لا توجد نتائج', 'No matches'))]));
    const hotEl = list.querySelector('.hot');
    if (hotEl) hotEl.scrollIntoView({ block: 'nearest' });
  };
  const paint = () => {
    [...list.children].forEach((el, i) => el.classList.toggle('hot', i === hot));
  };
  const m = modal({
    title: '', noHeader: true, cls: 'palette', top: true, enterSubmits: false, width: 640,
    body: h('div', { style: { margin: '0 -22px -14px' } }, h('div.qin', input), list),
  });
  const choose = (i) => {
    const it = shown[i];
    if (!it) return;
    m.close(true);
    setTimeout(() => it.run(), 0);
  };
  input.addEventListener('input', () => { hot = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); hot = Math.min(shown.length - 1, hot + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hot = Math.max(0, hot - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(hot); }
  });
  render();
  input.focus();
}

export { icon };
