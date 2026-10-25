// Command registry, menus, context menus and keyboard handling.
import { undo, redo, selectAll, deleteLine, moveLineUp, moveLineDown, copyLineDown, indentMore, indentLess, toggleComment, cursorDocStart } from '@codemirror/commands';
import { foldAll, unfoldAll } from '@codemirror/language';
import { ctx } from './ctx.js';
import { L } from './l10n.js';
import { h, toast, modalOpen, icon } from './ui.js';
import { transformSelection, insertAtSelection } from './editor.js';
import * as AR from './core/arabic.js';
import * as TX from './core/textops.js';
import { showSettings, showStats, showTafqeet, showGoto, showEncoding, showEol, showModePicker, showShortcuts, showAbout, showPalette } from './dialogs.js';

const G = (ar, en) => ({ ar, en });
const GR = {
  file: G('ملف', 'File'), edit: G('تحرير', 'Edit'), lines: G('أسطر', 'Lines'), ar: G('عربي', 'Arabic'),
  view: G('عرض', 'View'), tools: G('أدوات', 'Tools'), help: G('مساعدة', 'Help'), tab: G('تبويب', 'Tab'),
};

function reg(id, ar, en, group, o = {}) {
  ctx.cmds.set(id, {
    id, ar, en, group, keys: o.keys || [], nativeKeys: o.native || '', run: o.run || (() => {}),
    check: o.check, enabled: o.enabled, hidden: !!o.hidden,
  });
}
export function runCommand(id) {
  const c = ctx.cmds.get(id);
  if (c && (!c.enabled || c.enabled())) c.run();
}

const A = () => ctx.app;
const V = () => ctx.view;
const doc = () => ctx.cur;
const tf = (fn, opts) => () => {
  const n = transformSelection(V(), fn, opts);
  if (!n) toast(L('لا تغيير: النص مطابق أصلًا', 'No change: nothing to modify'));
  V().focus();
};
const cm = (fn) => () => { fn(V()); V().focus(); };

async function doCopy(cut) {
  const v = V();
  const sel = v.state.selection;
  let text;
  if (sel.main.empty) {
    const l = v.state.doc.lineAt(sel.main.head);
    text = l.text + '\n';
    if (cut) v.dispatch({ changes: { from: l.from, to: Math.min(l.to + 1, v.state.doc.length) } });
  } else {
    text = sel.ranges.map((r) => v.state.sliceDoc(r.from, r.to)).join('\n');
    if (cut) v.dispatch(v.state.replaceSelection(''));
  }
  const ok = await A().copyText(text);
  if (!ok) toast(L('تعذر النسخ إلى الحافظة', 'Could not copy to the clipboard'), { error: true });
  v.focus();
}
async function doPaste() {
  const t = await A().pasteText();
  if (typeof t === 'string' && t) insertAtSelection(V(), t);
  else if (t === null) toast(L('تعذرت قراءة الحافظة، استخدم Ctrl+V', 'Could not read the clipboard, use Ctrl+V'), { error: true });
  V().focus();
}

function dateStrings() {
  const now = new Date();
  const greg = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { greg, hijri, time, iso };
}

async function reveal() {
  const d = doc();
  if (d && d.path) (await import('./bridge.js')).api.reveal(d.path);
}

async function copyPath() {
  const d = doc();
  if (d && d.path) { await A().copyText(d.path); toast(L('تم نسخ المسار', 'Path copied')); }
}

function toggle(key) { return () => A().setSetting(key, !ctx.S[key]); }

export function registerCommands() {
  ctx.cmds.clear();
  const F = GR.file, E = GR.edit, LN = GR.lines, AB = GR.ar, VW = GR.view, T = GR.tools, H = GR.help, TB = GR.tab;
  const hasPath = () => !!(doc() && doc().path);

  reg('file.new', 'ملف جديد', 'New file', F, { keys: ['Ctrl+N'], run: () => A().createDoc() });
  reg('file.open', 'فتح…', 'Open…', F, { keys: ['Ctrl+O'], run: async () => { const { api } = await import('./bridge.js'); const ps = await api.pick_open(); if (ps && ps.length) A().openPaths(ps); } });
  reg('file.save', 'حفظ', 'Save', F, { keys: ['Ctrl+S'], run: () => A().saveDoc(doc()) });
  reg('file.saveAs', 'حفظ باسم…', 'Save as…', F, { keys: ['Ctrl+Shift+S'], run: () => A().saveDoc(doc(), { as: true }) });
  reg('file.saveAll', 'حفظ الكل', 'Save all', F, { keys: ['Ctrl+Alt+S'], run: () => A().saveAll() });
  reg('file.reload', 'إعادة التحميل من القرص', 'Reload from disk', F, { enabled: hasPath, run: () => A().reloadDoc(doc()) });
  reg('file.rename', 'إعادة تسمية…', 'Rename…', F, { enabled: hasPath, run: () => A().renameDoc(doc()) });
  reg('file.reveal', 'إظهار في المجلد', 'Show in folder', F, { enabled: hasPath, run: reveal });
  reg('file.copyPath', 'نسخ مسار الملف', 'Copy file path', F, { enabled: hasPath, run: copyPath });
  reg('file.print', 'طباعة…', 'Print…', F, {
    keys: ['Ctrl+P'],
    run: () => {
      const area = document.getElementById('printArea');
      area.replaceChildren(h('pre', { dir: 'auto', style: { whiteSpace: 'pre-wrap', fontFamily: 'var(--ed-font)', fontSize: '12pt', lineHeight: '1.7', unicodeBidi: 'plaintext' } }, V().state.doc.toString()));
      setTimeout(() => window.print(), 50);
    },
  });
  reg('file.close', 'إغلاق التبويب', 'Close tab', F, { keys: ['Ctrl+W'], run: () => A().closeDoc(doc()) });
  reg('file.closeOthers', 'إغلاق التبويبات الأخرى', 'Close other tabs', F, { run: () => A().closeMany(ctx.docs.filter((d) => d !== doc())) });
  reg('file.closeAll', 'إغلاق كل التبويبات', 'Close all tabs', F, { run: () => A().closeMany(ctx.docs) });
  reg('file.exit', 'خروج', 'Exit', F, { keys: ['Alt+F4'], run: () => A().quit() });

  reg('edit.undo', 'تراجع', 'Undo', E, { native: 'Ctrl+Z', run: cm(undo) });
  reg('edit.redo', 'إعادة', 'Redo', E, { native: 'Ctrl+Y', run: cm(redo) });
  reg('edit.cut', 'قص', 'Cut', E, { native: 'Ctrl+X', run: () => doCopy(true) });
  reg('edit.copy', 'نسخ', 'Copy', E, { native: 'Ctrl+C', run: () => doCopy(false) });
  reg('edit.paste', 'لصق', 'Paste', E, { native: 'Ctrl+V', run: doPaste });
  reg('edit.selectAll', 'تحديد الكل', 'Select all', E, { native: 'Ctrl+A', run: cm(selectAll) });
  reg('edit.find', 'بحث…', 'Find…', E, { keys: ['Ctrl+F'], run: () => ctx.find.open({ replace: false }) });
  reg('edit.replace', 'استبدال…', 'Replace…', E, { keys: ['Ctrl+H'], run: () => ctx.find.open({ replace: true }) });
  reg('edit.findNext', 'البحث التالي', 'Find next', E, { keys: ['F3'], run: () => ctx.find.go(1) });
  reg('edit.findPrev', 'البحث السابق', 'Find previous', E, { keys: ['Shift+F3'], run: () => ctx.find.go(-1) });
  reg('edit.gotoLine', 'انتقال إلى سطر…', 'Go to line…', E, { keys: ['Ctrl+G'], run: showGoto });
  reg('edit.nextOcc', 'تحديد التكرار التالي (متعدد المؤشرات)', 'Select next occurrence', E, { native: 'Ctrl+D', run: () => V().focus() });
  reg('edit.date', 'إدراج التاريخ (ميلادي)', 'Insert date (Gregorian)', E, { keys: ['F5'], run: () => insertAtSelection(V(), dateStrings().greg) });
  reg('edit.dateHijri', 'إدراج التاريخ (هجري)', 'Insert date (Hijri)', E, { run: () => insertAtSelection(V(), dateStrings().hijri) });
  reg('edit.dateTime', 'إدراج التاريخ والوقت', 'Insert date & time', E, { keys: ['Shift+F5'], run: () => { const s = dateStrings(); insertAtSelection(V(), `${s.greg} — ${s.hijri} — ${s.time}`); } });
  reg('edit.dateIso', 'إدراج التاريخ (ISO)', 'Insert date (ISO)', E, { run: () => insertAtSelection(V(), dateStrings().iso) });
  reg('edit.comment', 'تبديل التعليق', 'Toggle comment', E, { native: 'Ctrl+/', run: cm(toggleComment) });
  reg('edit.indent', 'زيادة المسافة البادئة', 'Indent', E, { native: 'Tab', run: cm(indentMore) });
  reg('edit.outdent', 'تقليل المسافة البادئة', 'Outdent', E, { native: 'Shift+Tab', run: cm(indentLess) });
  reg('edit.foldAll', 'طي الكل', 'Fold all', E, { run: cm(foldAll) });
  reg('edit.unfoldAll', 'فتح الكل', 'Unfold all', E, { run: cm(unfoldAll) });

  reg('lines.duplicate', 'تكرار السطر', 'Duplicate line', LN, { keys: ['Ctrl+Shift+D'], run: cm(copyLineDown) });
  reg('lines.delete', 'حذف السطر', 'Delete line', LN, { keys: ['Ctrl+Shift+K'], run: cm(deleteLine) });
  reg('lines.up', 'تحريك السطر للأعلى', 'Move line up', LN, { native: 'Alt+↑', run: cm(moveLineUp) });
  reg('lines.down', 'تحريك السطر للأسفل', 'Move line down', LN, { native: 'Alt+↓', run: cm(moveLineDown) });
  const lo = (id, ar, en, fn) => reg(id, ar, en, LN, { run: tf(fn, { lines: true }) });
  lo('lines.sortAsc', 'ترتيب تصاعدي', 'Sort ascending', TX.sortLinesAsc);
  lo('lines.sortDesc', 'ترتيب تنازلي', 'Sort descending', TX.sortLinesDesc);
  lo('lines.reverse', 'عكس ترتيب الأسطر', 'Reverse lines', TX.reverseLines);
  lo('lines.unique', 'حذف الأسطر المكررة', 'Remove duplicate lines', TX.uniqueLines);
  lo('lines.removeEmpty', 'حذف الأسطر الفارغة', 'Remove empty lines', TX.removeEmptyLines);
  lo('lines.collapse', 'دمج الأسطر الفارغة المتتالية', 'Collapse blank lines', TX.collapseBlankLines);
  lo('lines.join', 'دمج الأسطر في سطر واحد', 'Join lines', TX.joinLines);
  lo('lines.number', 'ترقيم الأسطر', 'Number lines', TX.numberLines);
  lo('lines.trimEnd', 'حذف المسافات في نهاية الأسطر', 'Trim trailing spaces', TX.trimTrailing);
  lo('lines.trimStart', 'حذف المسافات في بداية الأسطر', 'Trim leading spaces', TX.trimLeading);
  reg('case.upper', 'أحرف كبيرة (لاتيني)', 'UPPERCASE', LN, { run: tf(TX.toUpper) });
  reg('case.lower', 'أحرف صغيرة (لاتيني)', 'lowercase', LN, { run: tf(TX.toLower) });
  reg('case.title', 'أول حرف كبير لكل كلمة', 'Title Case', LN, { run: tf(TX.toTitle) });
  reg('case.toggle', 'عكس حالة الأحرف', 'Toggle case', LN, { run: tf(TX.toggleCase) });
  reg('text.quotes', 'وضع النص بين « »', 'Wrap in « »', LN, { run: tf(TX.wrapQuotes) });

  const ar = (id, a, e, fn) => reg(id, a, e, AB, { run: tf(fn) });
  ar('ar.hindi', 'الأرقام إلى هندية (١٢٣)', 'Digits to Hindi (١٢٣)', AR.toHindiDigits);
  ar('ar.western', 'الأرقام إلى إنجليزية (123)', 'Digits to Western (123)', AR.toWesternDigits);
  ar('ar.tashkeel', 'حذف التشكيل', 'Remove diacritics', AR.removeTashkeel);
  ar('ar.tatweel', 'حذف التطويل', 'Remove tatweel', AR.removeTatweel);
  ar('ar.alef', 'توحيد الألف (أ إ آ ← ا)', 'Normalize alef', AR.normalizeAlef);
  ar('ar.yaa', 'توحيد الياء (ى ← ي)', 'Normalize yaa', AR.normalizeYaa);
  ar('ar.taa', 'تاء مربوطة إلى هاء', 'Taa marbuta to haa', AR.taaMarbutaToHaa);
  ar('ar.punct', 'علامات الترقيم العربية (، ؛ ؟)', 'Arabic punctuation', AR.arabicPunctuation);
  ar('ar.invisible', 'حذف الأحرف المخفية', 'Remove invisible characters', AR.removeInvisible);
  ar('ar.spaces', 'تنظيف المسافات', 'Clean spaces', AR.cleanSpaces);
  ar('ar.kbEn2Ar', 'تصحيح الكتابة بلغة خاطئة (EN ← عربي)', 'Fix wrong layout (EN → AR)', (t) => AR.fixKeyboard(t, 'en2ar'));
  ar('ar.kbAr2En', 'تصحيح الكتابة بلغة خاطئة (عربي ← EN)', 'Fix wrong layout (AR → EN)', (t) => AR.fixKeyboard(t, 'ar2en'));
  reg('ar.kbAuto', 'تصحيح لغة الكتابة تلقائيًا', 'Auto-fix wrong layout', AB, {
    run: tf((t) => { const d = AR.guessKeyboardDirection(t); return d ? AR.fixKeyboard(t, d) : t; }),
  });
  reg('ar.tafqeet', 'تفقيط المبالغ…', 'Tafqeet (amount in words)…', AB, { run: showTafqeet });
  reg('ar.stats', 'إحصائيات النص…', 'Text statistics…', AB, { keys: ['Ctrl+Shift+I'], run: showStats });

  reg('view.preview', 'معاينة ماركداون', 'Markdown preview', VW, { keys: ['Ctrl+Shift+V'], check: () => A().isPreviewOn(), run: () => A().setPreview(!A().isPreviewOn()) });
  reg('view.wrap', 'التفاف الأسطر', 'Word wrap', VW, { keys: ['Alt+Z'], check: () => ctx.S.wrap, run: toggle('wrap') });
  reg('view.numbers', 'أرقام الأسطر', 'Line numbers', VW, { check: () => ctx.S.lineNumbers, run: toggle('lineNumbers') });
  reg('view.whitespace', 'إظهار المسافات', 'Show whitespace', VW, { check: () => ctx.S.showWhitespace, run: toggle('showWhitespace') });
  reg('view.statusbar', 'شريط الحالة', 'Status bar', VW, { check: () => ctx.S.statusBar, run: toggle('statusBar') });
  reg('view.dir', 'تبديل اتجاه النص', 'Cycle text direction', VW, { keys: ['Ctrl+Shift+X'], run: () => { const d = ctx.S.textDir; A().setSetting('textDir', d === 'auto' ? 'rtl' : d === 'rtl' ? 'ltr' : 'auto'); } });
  reg('view.zoomIn', 'تكبير الخط', 'Zoom in', VW, { keys: ['Ctrl+=', 'Ctrl+Shift+='], run: () => A().setSetting('fontSize', Math.min(60, ctx.S.fontSize + 1)) });
  reg('view.zoomOut', 'تصغير الخط', 'Zoom out', VW, { keys: ['Ctrl+-'], run: () => A().setSetting('fontSize', Math.max(10, ctx.S.fontSize - 1)) });
  reg('view.zoomReset', 'إعادة حجم الخط', 'Reset zoom', VW, { keys: ['Ctrl+0'], run: () => A().setSetting('fontSize', 19) });
  reg('view.zen', 'وضع التركيز', 'Zen mode', VW, {
    keys: ['F9'], check: () => document.getElementById('app').classList.contains('zen'),
    run: () => { document.getElementById('app').classList.toggle('zen'); V().focus(); },
  });
  reg('view.fullscreen', 'ملء الشاشة', 'Fullscreen', VW, {
    keys: ['F11'], check: () => !!ctx.fullscreen,
    run: async () => { ctx.fullscreen = !ctx.fullscreen; (await import('./bridge.js')).api.window_op('fullscreen', ctx.fullscreen); },
  });
  reg('view.onTop', 'إبقاء النافذة في الأعلى', 'Always on top', VW, { check: () => ctx.S.alwaysOnTop, run: toggle('alwaysOnTop') });
  reg('view.theme', 'تبديل السمة', 'Toggle theme', VW, { run: () => A().setSetting('theme', ctx.S.isDark ? 'dawn' : 'nebula') });
  reg('view.lang', 'تبديل لغة الواجهة', 'Switch UI language', VW, { run: () => A().setSetting('lang', ctx.S.lang === 'ar' ? 'en' : 'ar') });
  reg('view.readonly', 'قراءة فقط', 'Read-only', VW, { check: () => !!(doc() && doc().readOnly), run: () => A().toggleReadOnly(doc()) });

  reg('tools.palette', 'لوحة الأوامر…', 'Command palette…', T, { keys: ['Ctrl+Shift+P'], run: showPalette });
  reg('tools.encoding', 'ترميز الملف…', 'File encoding…', T, { run: showEncoding });
  reg('tools.eol', 'نهاية السطر…', 'Line endings…', T, { run: showEol });
  reg('tools.mode', 'نوع النص…', 'Language mode…', T, { keys: ['Ctrl+Shift+L'], run: showModePicker });
  reg('tools.settings', 'الإعدادات…', 'Settings…', T, { keys: ['Ctrl+,'], run: showSettings });
  reg('tools.registerFiles', 'ربط الملفات النصية بسديم (أيقونة خاصة)…', 'Associate text files with Sadeem (custom icon)…', T, {
    run: async () => {
      const { api } = await import('./bridge.js');
      const r = await api.register_files();
      if (r && r.ok) toast(L('تم التسجيل. اختر سديم كتطبيق افتراضي لـ .txt في النافذة اللي انفتحت لتظهر الأيقونة', 'Registered. Pick Sadeem as the default app for .txt in the window that opened to get the icon'), { ms: 7000 });
      else toast(L('متاح على ويندوز فقط', 'Windows only'), { error: true });
    },
  });
  reg('tools.dataFolder', 'فتح مجلد البيانات', 'Open data folder', T, { run: () => A().openDataFolder() });

  reg('tab.next', 'التبويب التالي', 'Next tab', TB, { keys: ['Ctrl+PageDown'], run: () => cycleTab(1) });
  reg('tab.prev', 'التبويب السابق', 'Previous tab', TB, { keys: ['Ctrl+PageUp'], run: () => cycleTab(-1) });

  reg('help.shortcuts', 'اختصارات لوحة المفاتيح', 'Keyboard shortcuts', H, { keys: ['F1'], run: showShortcuts });
  reg('help.about', 'عن سديم', 'About Sadeem', H, { run: showAbout });
}

function cycleTab(dir) {
  const i = ctx.docs.indexOf(ctx.cur);
  const n = ctx.docs.length;
  A().activate(ctx.docs[(i + dir + n) % n]);
}

/* ---------- menus ---------- */
const MENUS = [
  { ar: 'ملف', en: 'File', items: ['file.new', 'file.open', 'recent', '-', 'file.save', 'file.saveAs', 'file.saveAll', '-', 'file.print', '-', 'file.reload', 'file.rename', 'file.reveal', 'file.copyPath', '-', 'file.close', 'file.closeOthers', 'file.closeAll', '-', 'file.exit'] },
  { ar: 'تحرير', en: 'Edit', items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.selectAll', '-', 'edit.find', 'edit.replace', 'edit.findNext', 'edit.findPrev', 'edit.gotoLine', '-', 'edit.date', 'edit.dateHijri', 'edit.dateTime', 'edit.dateIso', '-', 'edit.comment', 'edit.indent', 'edit.outdent', 'edit.foldAll', 'edit.unfoldAll'] },
  { ar: 'أسطر', en: 'Lines', items: ['lines.duplicate', 'lines.delete', 'lines.up', 'lines.down', '-', 'lines.sortAsc', 'lines.sortDesc', 'lines.reverse', 'lines.unique', 'lines.removeEmpty', 'lines.collapse', 'lines.join', 'lines.number', '-', 'lines.trimEnd', 'lines.trimStart', '-', 'case.upper', 'case.lower', 'case.title', 'case.toggle', 'text.quotes'] },
  { ar: 'عربي', en: 'Arabic', items: ['ar.hindi', 'ar.western', '-', 'ar.tashkeel', 'ar.tatweel', 'ar.alef', 'ar.yaa', 'ar.taa', '-', 'ar.punct', 'ar.invisible', 'ar.spaces', '-', 'ar.kbAuto', 'ar.kbEn2Ar', 'ar.kbAr2En', '-', 'ar.tafqeet', 'ar.stats'] },
  { ar: 'عرض', en: 'View', items: ['view.preview', 'view.wrap', 'view.numbers', 'view.whitespace', 'view.statusbar', 'view.readonly', '-', 'view.dir', 'view.zoomIn', 'view.zoomOut', 'view.zoomReset', '-', 'view.zen', 'view.fullscreen', 'view.onTop', '-', 'view.theme', 'view.lang'] },
  { ar: 'أدوات', en: 'Tools', items: ['tools.palette', 'tools.mode', 'tools.encoding', 'tools.eol', '-', 'tools.settings', 'tools.registerFiles', 'tools.dataFolder'] },
  { ar: 'مساعدة', en: 'Help', items: ['help.shortcuts', 'help.about'] },
];

let openMenu = null;
function closeMenus() {
  if (!openMenu) return;
  openMenu.panel.remove();
  openMenu.btn.setAttribute('aria-expanded', 'false');
  openMenu = null;
}

function buildItems(ids, after) {
  const out = [];
  for (const id of ids) {
    if (id === '-') { out.push(h('div.msep')); continue; }
    if (id === 'recent') {
      const rec = (ctx.S.recent || []).slice(0, 8);
      if (rec.length) {
        out.push(h('div.mhead', L('الملفات الأخيرة', 'Recent files')));
        for (const p of rec) {
          out.push(h('button.mi', { type: 'button', on: { click: () => { after(); A().openPaths([p]); } } },
            h('span'), h('span.t', { title: p }, p.split(/[\\/]/).pop()), h('span.sub', p.split(/[\\/]/).slice(-2, -1)[0] || '')));
        }
      }
      continue;
    }
    const c = ctx.cmds.get(id);
    if (!c) continue;
    const en = c.enabled ? c.enabled() : true;
    const on = c.check ? c.check() : null;
    out.push(h('button.mi', {
      type: 'button', disabled: !en, role: c.check ? 'menuitemcheckbox' : 'menuitem', 'aria-checked': c.check ? String(!!on) : null,
      on: { click: () => { after(); c.run(); } },
    }, h('span.mark'), h('span.t', L(c.ar, c.en)), h('span', c.keys[0] ? h('kbd', c.keys[0]) : c.nativeKeys ? h('kbd', c.nativeKeys) : '')));
  }
  return out;
}

function openAt(i, btn, box) {
  closeMenus();
  const panel = h('div.panel', { role: 'menu' }, buildItems(MENUS[i].items, closeMenus));
  box.append(panel);
  btn.setAttribute('aria-expanded', 'true');
  openMenu = { btn, panel, i };
}

export function renderMenubar() {
  closeMenus();
  const bar = document.getElementById('menubar');
  bar.replaceChildren(...MENUS.map((m, i) => {
    const box = h('div.menu');
    const btn = h('button.mbtn', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, L(m.ar, m.en));
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (openMenu && openMenu.btn === btn) closeMenus(); else openAt(i, btn, box); });
    btn.addEventListener('mouseenter', () => { if (openMenu && openMenu.btn !== btn) openAt(i, btn, box); });
    box.append(btn);
    return box;
  }));
}

document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.panel.contains(e.target) && !openMenu.btn.contains(e.target)) closeMenus(); });
window.addEventListener('blur', closeMenus);

/* ---------- context menus ---------- */
let closePopup = null;
function popup(x, y, children) {
  if (closePopup) closePopup();
  const scrim = h('div.ctxscrim');
  const panel = h('div.panel', { role: 'menu', style: { position: 'fixed', top: '0', left: '0', visibility: 'hidden' } }, children);
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const close = () => { scrim.remove(); window.removeEventListener('keydown', onKey, true); window.removeEventListener('blur', close); if (closePopup === close) closePopup = null; };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', close);
  closePopup = close;
  scrim.addEventListener('mousedown', (e) => { if (!panel.contains(e.target)) close(); });
  scrim.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (panel.contains(e.target)) return;
    close();
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (under) under.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, button: 2 }));
  });
  panel.addEventListener('click', close);
  scrim.append(panel);
  document.getElementById('overlay').append(scrim);
  const w = panel.offsetWidth;
  const hgt = panel.offsetHeight;
  panel.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  panel.style.top = Math.max(8, Math.min(y, innerHeight - hgt - 8)) + 'px';
  panel.style.visibility = '';
  return close;
}

export function showContextMenu(e) {
  const items = ['edit.cut', 'edit.copy', 'edit.paste', 'edit.selectAll', '-', 'edit.find', 'lines.duplicate', 'lines.delete', '-', 'ar.tashkeel', 'ar.hindi', 'ar.western', 'ar.kbAuto', '-', 'view.preview'];
  popup(e.clientX, e.clientY, buildItems(items, () => {}));
}

export function showTabMenu(e, d) {
  const mk = (ar, en, fn, off) => h('button.mi', { type: 'button', disabled: !!off, on: { click: fn } }, h('span'), h('span.t', L(ar, en)), h('span'));
  popup(e.clientX, e.clientY, [
    mk('حفظ', 'Save', () => A().saveDoc(d)),
    mk('حفظ باسم…', 'Save as…', () => A().saveDoc(d, { as: true })),
    h('div.msep'),
    mk('إعادة تسمية…', 'Rename…', () => A().renameDoc(d)),
    mk('إعادة التحميل', 'Reload', () => A().reloadDoc(d), !d.path),
    mk('إظهار في المجلد', 'Show in folder', async () => (await import('./bridge.js')).api.reveal(d.path), !d.path),
    mk('نسخ المسار', 'Copy path', () => A().copyText(d.path), !d.path),
    mk(d.readOnly ? 'السماح بالتعديل' : 'قراءة فقط', d.readOnly ? 'Allow editing' : 'Read-only', () => A().toggleReadOnly(d)),
    h('div.msep'),
    mk('إغلاق', 'Close', () => A().closeDoc(d)),
    mk('إغلاق الأخرى', 'Close others', () => A().closeMany(ctx.docs.filter((x) => x !== d)), ctx.docs.length < 2),
    mk('إغلاق الكل', 'Close all', () => A().closeMany(ctx.docs)),
  ]);
}

/* ---------- keyboard ---------- */
function parseKey(s) {
  const parts = s.split('+');
  const key = parts.pop();
  const m = { ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
  let code;
  if (/^[A-Z]$/.test(key)) code = 'Key' + key;
  else if (/^[0-9]$/.test(key)) code = 'Digit' + key;
  else if (/^F\d+$/.test(key)) code = key;
  else code = { '=': 'Equal', '-': 'Minus', ',': 'Comma', '/': 'Slash' }[key] || key;
  return { ...m, code };
}

export function installKeyboard() {
  const table = [];
  for (const c of ctx.cmds.values()) for (const k of c.keys) if (k !== 'Alt+F4') table.push([parseKey(k), c]);
  window.addEventListener('keydown', (e) => {
    if (modalOpen()) return;
    if (e.key === 'Escape') { closeMenus(); if (document.getElementById('app').classList.contains('zen')) runCommand('view.zen'); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    for (const [k, c] of table) {
      const code = e.code === 'NumpadAdd' ? 'Equal' : e.code === 'NumpadSubtract' ? 'Minus' : e.code === 'Numpad0' ? 'Digit0' : e.code;
      if (k.code === code && k.ctrl === ctrl && k.shift === e.shiftKey && k.alt === e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!c.enabled || c.enabled()) c.run();
        return;
      }
    }
    if (ctrl && !e.altKey && ['KeyR', 'KeyU', 'KeyJ', 'KeyO'].includes(e.code) && !table.some(([k]) => k.code === e.code && k.ctrl === ctrl && k.shift === e.shiftKey)) { e.preventDefault(); return; }
    if (ctrl && !e.altKey && e.code === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); }
  }, true);
}
