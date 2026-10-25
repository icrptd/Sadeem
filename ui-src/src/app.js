// Sadeem core: settings, documents (tabs), saving, session, external-change checks, preview and boot.
import { EditorView } from '@codemirror/view';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { api, hasBackend } from './bridge.js';
import { ctx, encLabel } from './ctx.js';
import { L, setLang, num } from './l10n.js';
import { h, $, toast, confirmDialog, promptDialog, icon } from './ui.js';
import { createEditor, FONT_STACKS } from './editor.js';
import { createFind, searchExtension } from './searchui.js';
import { modeForPath, getMode } from './languages.js';
import { registerCommands, renderMenubar, showContextMenu, showTabMenu, installKeyboard, runCommand } from './commands.js';
import { showEncoding, showEol, showModePicker, showSettings } from './dialogs.js';
import { trimTrailing } from './core/textops.js';

const A = ctx.app;

export const DEFAULTS = {
  lang: 'ar', theme: 'nebula', accent: 'rose',
  font: 'plex', customFont: '', fontSize: 19, lineHeight: 1.9, tabSize: 4, useSpaces: false,
  wrap: true, lineNumbers: true, highlightLine: true, showWhitespace: false, textDir: 'auto', autoBrackets: false, spellcheck: false,
  statusBar: true, defaultEncoding: 'utf-8', defaultEol: 'crlf',
  autosave: 'off', autosaveSeconds: 30, trimOnSave: false, finalNewline: false,
  restoreSession: true, askBeforeExit: false, autoReload: true, alwaysOnTop: false,
  tafqeetCurrency: 'sar',
  search: { query: '', replace: '', caseSensitive: false, wholeWord: false, regex: false, arabicFuzzy: true },
  recent: [],
};

/* ---------- small helpers ---------- */
const basename = (p) => p.split(/[\\/]/).pop();
const parentName = (p) => { const parts = p.split(/[\\/]/); return parts.length > 1 ? parts[parts.length - 2] : ''; };
const normPath = (p) => p.replace(/\//g, '\\').toLowerCase();
let nextId = 1;

export const stateOf = (d) => (d === ctx.cur ? ctx.view.state : d.state);
export const textOf = (d) => stateOf(d).doc.toString();
export const docName = (d) => (d.path ? basename(d.path) : `${L('بدون عنوان', 'Untitled')} ${d.untitledN}`);
const isDirty = (d) => d.dirty;

/* ---------- settings ---------- */
let persistTimer = null;
function flushSettings() {
  clearTimeout(persistTimer);
  persistTimer = null;
  if (!ctx.S) return Promise.resolve();
  const { isDark, ...clean } = ctx.S;
  return api.save_settings(clean);
}

function persistSettings() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(flushSettings, 300);
}

function resolveTheme() {
  const S = ctx.S;
  if (S.theme === 'system') return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'nebula' : 'dawn';
  return S.theme;
}

function syncKeyFor(d) {
  const S = ctx.S;
  return JSON.stringify([S.lineNumbers, S.highlightLine, S.wrap, S.textDir, S.tabSize, S.useSpaces, S.isDark, S.showWhitespace, S.autoBrackets, S.spellcheck, S.lang, d.mode, d.readOnly]);
}

function syncCurrent() {
  const d = ctx.cur;
  if (!d) return;
  ctx.editor.sync(ctx.S, d, ctx.S.lang);
  d.syncKey = syncKeyFor(d);
}

function applySettings({ sync = true } = {}) {
  const S = ctx.S;
  const root = document.documentElement;
  const theme = resolveTheme();
  root.dataset.theme = theme;
  root.dataset.accent = S.accent;
  S.isDark = theme === 'nebula' || theme === 'amoled';
  const custom = S.customFont ? `'${S.customFont.replace(/['"\\]/g, '')}', ` : '';
  root.style.setProperty('--ed-font', custom + (FONT_STACKS[S.font] || FONT_STACKS.plex));
  root.style.setProperty('--ed-size', S.fontSize + 'px');
  root.style.setProperty('--ed-lh', String(S.lineHeight));
  $('#statusbar').hidden = !S.statusBar;
  if (sync && ctx.cur) syncCurrent();
}

function renderQuick() {
  const S = ctx.S;
  const btn = (name, title, fn, pressed) => h('button.icon-btn', { type: 'button', title, 'aria-label': title, html: icon(name), 'aria-pressed': pressed === undefined ? null : String(pressed), on: { click: fn } });
  const dark = S.isDark;
  $('#quick').replaceChildren(
    btn('plus', L('جديد (Ctrl+N)', 'New (Ctrl+N)'), () => runCommand('file.new')),
    btn('folder', L('فتح (Ctrl+O)', 'Open (Ctrl+O)'), () => runCommand('file.open')),
    btn('save', L('حفظ (Ctrl+S)', 'Save (Ctrl+S)'), () => runCommand('file.save')),
    h('span.sep-v'),
    btn('undo', L('تراجع (Ctrl+Z)', 'Undo (Ctrl+Z)'), () => runCommand('edit.undo')),
    btn('redo', L('إعادة (Ctrl+Y)', 'Redo (Ctrl+Y)'), () => runCommand('edit.redo')),
    btn('search', L('بحث (Ctrl+F)', 'Find (Ctrl+F)'), () => runCommand('edit.find')),
    h('span.sep-v'),
    btn('eye', L('معاينة ماركداون (Ctrl+Shift+V)', 'Markdown preview (Ctrl+Shift+V)'), () => runCommand('view.preview'), previewOn),
    btn('spark', L('لوحة الأوامر (Ctrl+Shift+P)', 'Command palette (Ctrl+Shift+P)'), () => runCommand('tools.palette')),
    btn(dark ? 'sun' : 'moon', L('تبديل السمة', 'Toggle theme'), () => setSetting('theme', dark ? 'dawn' : 'nebula')),
    btn('globe', L('English', 'العربية'), () => setSetting('lang', S.lang === 'ar' ? 'en' : 'ar')),
    btn('sliders', L('الإعدادات (Ctrl+,)', 'Settings (Ctrl+,)'), () => showSettings()));
}

function rebuildChrome() {
  renderMenubar();
  renderQuick();
  renderTabs();
  renderStatus();
  ctx.find.rebuild();
  $('#newTab').setAttribute('aria-label', L('تبويب جديد', 'New tab'));
  $('#newTab').title = L('تبويب جديد (Ctrl+N)', 'New tab (Ctrl+N)');
  $('#brand').title = L('سديم', 'Sadeem');
  updateTitle();
}

export function setSetting(key, value) {
  const S = ctx.S;
  S[key] = value;
  if (key === 'lang') setLang(value);
  applySettings();
  if (key === 'lang' || key === 'theme' || key === 'accent') rebuildChrome();
  if (key === 'alwaysOnTop') api.window_op('on_top', !!value);
  if (key === 'autosave' || key === 'autosaveSeconds') setupAutosave();
  if (key === 'statusBar') renderStatus();
  persistSettings();
}

async function resetSettings() {
  const ok = await confirmDialog({
    title: L('إعادة الإعدادات', 'Reset settings'),
    message: L('ستعود كل الإعدادات إلى قيمها الأصلية. الملفات والتبويبات لا تتأثر.', 'All settings return to their defaults. Files and tabs are not affected.'),
    buttons: [{ label: L('إعادة', 'Reset'), value: true, primary: true }, { label: L('إلغاء', 'Cancel'), value: null }],
  });
  if (!ok) return;
  const recent = ctx.S.recent;
  ctx.S = { ...structuredClone(DEFAULTS), recent };
  ctx.find.setPrefs && ctx.find.setPrefs(ctx.S.search);
  setLang(ctx.S.lang);
  applySettings();
  rebuildChrome();
  api.window_op('on_top', false);
  setupAutosave();
  persistSettings();
  toast(L('تمت إعادة الإعدادات', 'Settings were reset'));
}

/* ---------- documents ---------- */
function allocUntitled() {
  const used = new Set(ctx.docs.filter((d) => !d.path).map((d) => d.untitledN));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export function createDoc(o = {}) {
  const S = ctx.S;
  const d = {
    id: nextId++, path: o.path || null, encoding: o.encoding || S.defaultEncoding, eol: o.eol || S.defaultEol,
    mode: o.mode || modeForPath(o.path), modeManual: !!o.modeManual, readOnly: !!o.readOnly,
    mtime: o.mtime || 0, seen: o.mtime || 0, size: o.size || 0, scroll: 0, dirty: false, meta: false, conflict: null,
    untitledN: o.path ? 0 : allocUntitled(), syncKey: '',
  };
  d.state = ctx.editor.makeState(o.text || '', S, d, S.lang);
  d.saved = d.state.doc;
  d.syncKey = syncKeyFor(d);
  ctx.docs.push(d);
  if (o.activate !== false) activate(d); else renderTabs();
  return d;
}

export function activate(d) {
  if (!d) return;
  if (ctx.cur === d) { ctx.view.focus(); return; }
  const prev = ctx.cur;
  if (prev && ctx.docs.includes(prev)) {
    prev.state = ctx.view.state;
    prev.scroll = ctx.view.scrollDOM.scrollTop;
  }
  ctx.cur = d;
  ctx.view.setState(d.state);
  if (syncKeyFor(d) !== d.syncKey) syncCurrent();
  requestAnimationFrame(() => { ctx.view.scrollDOM.scrollTop = d.scroll; });
  ctx.view.focus();
  renderTabs();
  renderStatus();
  renderBanner();
  updateTitle();
  ctx.find.refresh();
  schedulePreview();
  scheduleCounts();
  scheduleSession();
}

function recalcDirty(d) {
  const was = d.dirty;
  d.dirty = d.meta || !stateOf(d).doc.eq(d.saved);
  if (was !== d.dirty) {
    renderTabs();
    updateTitle();
    notifyDirty();
    renderStatus();
  }
}

function isPristine(d) {
  return d && !d.path && !d.dirty && !d.meta && stateOf(d).doc.length === 0;
}

const opening = new Map();
export function openPath(path, o = {}) {
  // the same file requested twice at once (drop + second launch, double click) must open one tab only
  const key = normPath(path);
  if (opening.has(key)) return opening.get(key);
  const p = openPathNow(path, o).finally(() => opening.delete(key));
  opening.set(key, p);
  return p;
}

async function openPathNow(path, { encoding = null, force = false } = {}) {
  const ex = ctx.docs.find((d) => d.path && normPath(d.path) === normPath(path));
  if (ex) { activate(ex); return ex; }
  const r = await api.read_file(path, encoding, force);
  if (!r) { toast(L('تعذر فتح الملف', 'Could not open the file'), { error: true }); return null; }
  if (r.error === 'binary' || r.error === 'toolarge') {
    const msg = r.error === 'binary'
      ? L('يبدو أن هذا الملف ثنائي وليس نصًا، وقد يظهر بشكل غير مفهوم.', 'This looks like a binary file, not text. It may appear garbled.')
      : L(`حجم الملف كبير (${num(Math.round((r.size || 0) / 1048576))} ميجابايت) وقد يبطئ المحرر.`, `This file is large (${num(Math.round((r.size || 0) / 1048576))} MB) and may slow the editor.`);
    const ok = await confirmDialog({
      title: basename(path), message: msg,
      buttons: [{ label: L('فتح على أي حال', 'Open anyway'), value: true, primary: true }, { label: L('إلغاء', 'Cancel'), value: null }],
    });
    if (!ok) return null;
    return openPathNow(path, { encoding, force: true });
  }
  if (r.error) {
    toast(r.error === 'notfound' ? L('الملف غير موجود', 'File not found') : (r.message || L('تعذر فتح الملف', 'Could not open the file')), { error: true });
    return null;
  }
  const old = ctx.cur;
  const replaceOld = ctx.docs.length === 1 && isPristine(old);
  const d = createDoc({ text: r.text, path, encoding: r.encoding, eol: r.eol || ctx.S.defaultEol, mtime: r.mtime, size: r.size });
  if (replaceOld) {
    ctx.docs.splice(ctx.docs.indexOf(old), 1);
    renderTabs();
  }
  if (/^\.LOG(\r?\n|$)/.test(r.text)) {
    const stamp = new Date().toLocaleString('en-GB', { hour12: false });
    const nl = r.text.endsWith('\n') ? '' : '\n';
    const len = ctx.view.state.doc.length;
    ctx.view.dispatch({ changes: { from: len, insert: `${nl}${stamp}\n` }, selection: { anchor: len + nl.length + stamp.length + 1 }, scrollIntoView: true });
  }
  addRecent(path);
  return d;
}

export async function openPaths(paths) {
  let last = null;
  for (const p of paths || []) {
    const d = await openPath(p);
    if (d) last = d;
  }
  if (last) activate(last);
  return !!last;
}

function addRecent(path) {
  const S = ctx.S;
  S.recent = [path, ...(S.recent || []).filter((p) => normPath(p) !== normPath(path))].slice(0, 15);
  persistSettings();
}

function suggestedName(d) {
  if (d.path) return basename(d.path);
  const ext = (getMode(d.mode).exts[0]) || 'txt';
  return `${docName(d)}.${ext}`;
}

function applyPreSave(d) {
  const S = ctx.S;
  const isCur = d === ctx.cur;
  const st = stateOf(d);
  const text = st.doc.toString();
  let t = text;
  if (S.trimOnSave) t = trimTrailing(t);
  if (S.finalNewline && t.length && !t.endsWith('\n')) t += '\n';
  if (t !== text) {
    const spec = { changes: { from: 0, to: text.length, insert: t } };
    if (isCur) ctx.view.dispatch({ ...spec, selection: { anchor: Math.min(st.selection.main.head, t.length) } });
    else d.state = st.update(spec).state;
  }
  return t;
}

export async function saveDoc(d, { as = false, silent = false } = {}) {
  let path = d.path;
  if (as || !path) {
    const dir = d.path ? d.path.replace(/[\\/][^\\/]*$/, '') : (ctx.S.recent[0] || '').replace(/[\\/][^\\/]*$/, '');
    path = await api.pick_save(suggestedName(d), dir || '');
    if (!path) return false;
  }
  const text = applyPreSave(d);
  let res = await api.write_file(path, text, d.encoding, d.eol);
  if (res && res.error === 'encode') {
    const ok = await confirmDialog({
      title: L('تعذر الحفظ بهذا الترميز', 'Cannot save in this encoding'),
      message: L(`الترميز ${encLabel(d.encoding)} لا يدعم بعض الأحرف في النص. هل تحفظ بترميز UTF-8؟`, `${encLabel(d.encoding)} cannot represent some characters in this text. Save as UTF-8 instead?`),
      buttons: [{ label: L('حفظ بـ UTF-8', 'Save as UTF-8'), value: true, primary: true }, { label: L('إلغاء', 'Cancel'), value: null }],
    });
    if (!ok) return false;
    d.encoding = 'utf-8';
    res = await api.write_file(path, text, d.encoding, d.eol);
  }
  if (!res || !res.ok) {
    toast((res && res.message) || L('تعذر حفظ الملف', 'Could not save the file'), { error: true });
    return false;
  }
  d.path = path;
  d.mtime = res.mtime;
  d.seen = res.mtime;
  d.size = res.size;
  d.saved = stateOf(d).doc;
  d.dirty = false;
  d.meta = false;
  d.conflict = null;
  if (!d.modeManual) {
    const m = modeForPath(path);
    if (m !== d.mode) { d.mode = m; if (d === ctx.cur) syncCurrent(); }
  }
  addRecent(path);
  renderTabs();
  renderStatus();
  renderBanner();
  updateTitle();
  notifyDirty();
  scheduleSession();
  if (!silent) toast(L(`تم الحفظ: ${basename(path)}`, `Saved: ${basename(path)}`));
  return true;
}

async function askUnsaved(d) {
  const r = await confirmDialog({
    title: L('تغييرات غير محفوظة', 'Unsaved changes'),
    message: L(`هل تريد حفظ التغييرات في «${docName(d)}»؟`, `Save changes to “${docName(d)}”?`),
    buttons: [
      { label: L('حفظ', 'Save'), value: 'save', primary: true },
      { label: L('عدم الحفظ', "Don't save"), value: 'discard' },
      { label: L('إلغاء', 'Cancel'), value: null },
    ],
  });
  if (r === 'save') return (await saveDoc(d)) ? 'ok' : 'cancel';
  if (r === 'discard') return 'ok';
  return 'cancel';
}

export async function closeDoc(d, { force = false } = {}) {
  if (!force && d.dirty) {
    activate(d);
    if ((await askUnsaved(d)) === 'cancel') return false;
  }
  const i = ctx.docs.indexOf(d);
  if (i < 0) return true;
  const wasCur = ctx.cur === d;
  ctx.docs.splice(i, 1);
  if (!ctx.docs.length) {
    ctx.cur = null;
    createDoc();
  } else if (wasCur) {
    ctx.cur = null;
    activate(ctx.docs[Math.min(i, ctx.docs.length - 1)]);
  } else {
    renderTabs();
  }
  notifyDirty();
  scheduleSession();
  return true;
}

export async function closeMany(list) {
  for (const d of [...list]) {
    if (!(await closeDoc(d))) return false;
  }
  return true;
}

export async function reloadDoc(d, encoding = null, { silent = false } = {}) {
  if (!d.path) return;
  if (!silent && d.dirty) {
    const ok = await confirmDialog({
      title: L('إعادة التحميل من القرص', 'Reload from disk'),
      message: L('ستفقد التعديلات غير المحفوظة في هذا التبويب.', 'Unsaved changes in this tab will be lost.'),
      buttons: [{ label: L('إعادة التحميل', 'Reload'), value: true, primary: true, danger: true }, { label: L('إلغاء', 'Cancel'), value: null }],
    });
    if (!ok) return;
  }
  const r = await api.read_file(d.path, encoding, true);
  if (!r || r.error) { toast(L('تعذر قراءة الملف', 'Could not read the file'), { error: true }); return; }
  const head = stateOf(d).selection.main.head;
  const st = ctx.editor.makeState(r.text, ctx.S, d, ctx.S.lang);
  d.state = st;
  d.saved = st.doc;
  d.encoding = r.encoding;
  d.eol = r.eol || d.eol;
  d.mtime = r.mtime;
  d.seen = r.mtime;
  d.size = r.size;
  d.dirty = false;
  d.meta = false;
  d.conflict = null;
  d.syncKey = syncKeyFor(d);
  if (d === ctx.cur) {
    const sc = ctx.view.scrollDOM.scrollTop;
    ctx.view.setState(st);
    ctx.view.dispatch({ selection: { anchor: Math.min(head, st.doc.length) } });
    requestAnimationFrame(() => { ctx.view.scrollDOM.scrollTop = sc; });
  }
  renderTabs();
  scheduleCounts();
  schedulePreview();
  renderStatus();
  renderBanner();
  updateTitle();
  notifyDirty();
  if (!silent) toast(L('تمت إعادة تحميل الملف', 'File reloaded'));
}

async function renameDoc(d) {
  if (!d.path) { await saveDoc(d, { as: true }); return; }
  const cur = basename(d.path);
  const v = await promptDialog({
    title: L('إعادة تسمية الملف', 'Rename file'), label: L('الاسم الجديد', 'New name'), value: cur,
    validate: (s) => (!s.trim() ? L('الاسم فارغ', 'Name is empty') : /[\\/:*?"<>|]/.test(s) ? L('الاسم يحتوي على رمز غير مسموح', 'Name contains an invalid character') : null),
  });
  if (!v || v === cur) return;
  const r = await api.rename_file(d.path, v.trim());
  if (!r || !r.ok) { toast((r && r.message) || L('تعذرت إعادة التسمية', 'Rename failed'), { error: true }); return; }
  d.path = r.path;
  if (!d.modeManual) { d.mode = modeForPath(r.path); if (d === ctx.cur) syncCurrent(); }
  renderTabs();
  updateTitle();
  scheduleSession();
  toast(L('تمت إعادة التسمية', 'Renamed'));
}

function setDocEncoding(d, enc) {
  d.encoding = enc;
  d.meta = true;
  recalcDirty(d);
  renderStatus();
  toast(L(`سيُحفظ الملف بترميز ${encLabel(enc)}`, `The file will be saved as ${encLabel(enc)}`));
}

function setDocEol(d, eol) {
  d.eol = eol;
  d.meta = true;
  recalcDirty(d);
  renderStatus();
}

function setDocMode(d, mode) {
  d.mode = mode;
  d.modeManual = true;
  if (d === ctx.cur) syncCurrent();
  renderStatus();
  scheduleSession();
}

function toggleReadOnly(d) {
  d.readOnly = !d.readOnly;
  if (d === ctx.cur) syncCurrent();
  renderTabs();
  renderStatus();
  toast(d.readOnly ? L('التبويب للقراءة فقط', 'Tab is read-only') : L('أصبح التبويب قابلًا للتعديل', 'Tab is editable'));
}

/* ---------- tabs ---------- */
let dragId = null;

export function renderTabs() {
  const box = $('#tabs');
  if (!box) return;
  const names = new Map();
  ctx.docs.forEach((d) => names.set(docName(d), (names.get(docName(d)) || 0) + 1));
  box.replaceChildren(...ctx.docs.map((d) => {
    const dup = d.path && names.get(docName(d)) > 1;
    const el = h('div.tab', {
      role: 'tab', 'aria-selected': String(d === ctx.cur), draggable: true, dataset: { id: d.id }, title: d.path || docName(d),
      class: [d === ctx.cur ? 'active' : '', d.dirty ? 'dirty' : '', d.readOnly ? 'ro' : ''].join(' '),
      on: {
        click: () => activate(d),
        auxclick: (e) => { if (e.button === 1) { e.preventDefault(); closeDoc(d); } },
        contextmenu: (e) => { e.preventDefault(); showTabMenu(e, d); },
        dragstart: (e) => { dragId = d.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', docName(d)); } catch (x) { /* ignore */ } },
        dragover: (e) => {
          if (dragId === null) return;
          e.preventDefault();
          const rect = el.getBoundingClientRect();
          const before = (e.clientX < rect.left + rect.width / 2) === (document.documentElement.dir !== 'rtl');
          el.classList.toggle('drop-before', before);
          el.classList.toggle('drop-after', !before);
        },
        dragleave: () => el.classList.remove('drop-before', 'drop-after'),
        drop: (e) => {
          e.preventDefault();
          const before = el.classList.contains('drop-before');
          el.classList.remove('drop-before', 'drop-after');
          const from = ctx.docs.find((x) => x.id === dragId);
          dragId = null;
          if (!from || from === d) return;
          ctx.docs.splice(ctx.docs.indexOf(from), 1);
          const at = ctx.docs.indexOf(d);
          ctx.docs.splice(before ? at : at + 1, 0, from);
          renderTabs();
          scheduleSession();
        },
        dragend: () => { dragId = null; },
      },
    },
    h('span.name', docName(d), dup ? h('small', parentName(d.path)) : null),
    h('button.close', { type: 'button', title: L('إغلاق (Ctrl+W)', 'Close (Ctrl+W)'), html: icon('x'), on: { click: (e) => { e.stopPropagation(); closeDoc(d); } } }));
    return el;
  }));
  const active = box.querySelector('.tab.active');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* ---------- status bar ---------- */
let statusQueued = false;
let counts = { words: 0, chars: 0 };
let countTimer = null;

function scheduleCounts() {
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    if (!ctx.view) return;
    const doc = ctx.view.state.doc;
    counts.chars = doc.length;
    counts.words = doc.length > 4000000 ? -1 : (doc.toString().match(/[\p{L}\p{N}\p{M}_]+/gu) || []).length;
    scheduleStatus();
  }, 220);
}

function scheduleStatus() {
  if (statusQueued) return;
  statusQueued = true;
  requestAnimationFrame(() => { statusQueued = false; renderStatus(); });
}

export function renderStatus() {
  const bar = $('#statusbar');
  const d = ctx.cur;
  if (!bar || !d || !ctx.view) return;
  const S = ctx.S;
  const st = ctx.view.state;
  const main = st.selection.main;
  const line = st.doc.lineAt(main.head);
  const selChars = st.selection.ranges.reduce((a, r) => a + (r.to - r.from), 0);
  const item = (content, onClick, title) => (onClick
    ? h('button.si', { type: 'button', title, on: { click: onClick } }, content)
    : h('span.si', { title }, content));
  const parts = [
    item(L(`سطر ${num(line.number)}، عمود ${num(main.head - line.from + 1)}`, `Ln ${num(line.number)}, Col ${num(main.head - line.from + 1)}`), () => runCommand('edit.gotoLine'), L('الانتقال إلى سطر (Ctrl+G)', 'Go to line (Ctrl+G)')),
  ];
  if (st.selection.ranges.length > 1) parts.push(item(L(`${num(st.selection.ranges.length)} مؤشرات`, `${num(st.selection.ranges.length)} cursors`)));
  if (selChars) parts.push(item(L(`محدد: ${num(selChars)}`, `Selected: ${num(selChars)}`)));
  parts.push(item(
    counts.words < 0 ? L(`${num(counts.chars)} حرف`, `${num(counts.chars)} chars`) : L(`${num(counts.words)} كلمة · ${num(counts.chars)} حرف`, `${num(counts.words)} words · ${num(counts.chars)} chars`),
    () => runCommand('ar.stats'), L('إحصائيات النص', 'Text statistics')));
  parts.push(h('span.spacer'));
  parts.push(item(d.dirty ? h('span.unsaved', L('● غير محفوظ', '● Unsaved')) : h('span.saved', d.path ? L('✓ محفوظ', '✓ Saved') : L('جديد', 'New'))));
  parts.push(item(L(getMode(d.mode).ar, getMode(d.mode).en), showModePicker, L('نوع النص', 'Language mode')));
  parts.push(item(encLabel(d.encoding), showEncoding, L('ترميز الملف', 'File encoding')));
  parts.push(item(d.eol.toUpperCase(), showEol, L('نهاية السطر', 'Line endings')));
  const dirLabel = S.textDir === 'auto' ? L('اتجاه تلقائي', 'Auto dir') : S.textDir === 'rtl' ? 'RTL' : 'LTR';
  parts.push(item(dirLabel, () => setSetting('textDir', S.textDir === 'auto' ? 'rtl' : S.textDir === 'rtl' ? 'ltr' : 'auto'), L('اتجاه النص (انقر للتبديل)', 'Text direction (click to cycle)')));
  parts.push(item(`${Math.round((S.fontSize / DEFAULTS.fontSize) * 100)}%`, () => setSetting('fontSize', DEFAULTS.fontSize), L('تكبير الخط (انقر للإعادة)', 'Zoom (click to reset)')));
  bar.replaceChildren(...parts);
}

/* ---------- banner ---------- */
export function renderBanner() {
  const el = $('#banner');
  const d = ctx.cur;
  if (!d || !d.conflict) { el.hidden = true; el.replaceChildren(); return; }
  const dismiss = () => { d.conflict = null; renderBanner(); };
  el.hidden = false;
  if (d.conflict === 'modified') {
    el.replaceChildren(
      h('span.grow', L('تغيّر هذا الملف على القرص، وفي التبويب تعديلات غير محفوظة.', 'This file changed on disk and this tab has unsaved edits.')),
      h('button.btn', { type: 'button', on: { click: () => reloadDoc(d, null, { silent: true }) } }, L('تحميل نسخة القرص', 'Load disk version')),
      h('button.btn.primary', { type: 'button', on: { click: dismiss } }, L('إبقاء تعديلاتي', 'Keep my edits')));
  } else {
    el.replaceChildren(
      h('span.grow', L('هذا الملف حُذف أو نُقل من مكانه.', 'This file was deleted or moved.')),
      h('button.btn', { type: 'button', on: { click: () => saveDoc(d, { as: true }) } }, L('حفظ باسم…', 'Save as…')),
      h('button.btn.primary', { type: 'button', on: { click: dismiss } }, L('تجاهل', 'Dismiss')));
  }
}

function updateTitle() {
  const d = ctx.cur;
  if (!d) return;
  api.window_op('title', `${d.dirty ? '● ' : ''}${docName(d)} — ${L('سديم', 'Sadeem')}`);
}

/* ---------- external changes ---------- */
let checking = false;
async function checkExternal() {
  if (checking) return;
  const withPath = ctx.docs.filter((d) => d.path);
  if (!withPath.length) return;
  checking = true;
  try {
    const stats = await api.stat_files(withPath.map((d) => d.path));
    if (!stats) return;
    for (const d of withPath) {
      const s = stats[d.path];
      if (!s) continue;
      if (!s.exists) {
        if (d.conflict !== 'deleted' && d.seenMissing !== true) { d.conflict = 'deleted'; d.seenMissing = true; }
      } else {
        d.seenMissing = false;
        if (s.mtime > d.seen + 0.0005) {
          d.seen = s.mtime;
          if (!d.dirty && ctx.S.autoReload) { await reloadDoc(d, d.encoding, { silent: true }); toast(L(`تم تحديث «${docName(d)}» لأنه تغيّر خارج سديم`, `“${docName(d)}” was reloaded after an outside change`)); }
          else d.conflict = 'modified';
        }
      }
    }
    renderBanner();
  } finally {
    checking = false;
  }
}

/* ---------- preview ---------- */
let previewOn = false;
let previewTimer = null;
export const isPreviewOn = () => previewOn;

DOMPurify.addHook('afterSanitizeAttributes', (n) => {
  // the preview never loads remote content (no tracking pixels / network calls while previewing a file)
  if (n.tagName === 'IMG' && /^(https?:)?\/\//i.test(n.getAttribute('src') || '')) n.removeAttribute('src');
});

function renderPreview() {
  if (!previewOn || !ctx.view) return;
  const src = ctx.view.state.doc.toString();
  const html = marked.parse(src, { gfm: true, breaks: true, async: false });
  $('#previewBody').innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function schedulePreview() {
  if (!previewOn) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 180);
}

function setPreview(on) {
  previewOn = on;
  $('#previewPane').hidden = !on;
  if (on) renderPreview();
  renderQuick();
}

/* ---------- session ---------- */
let sessionTimer = null;
export function scheduleSession() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(flushSession, 700);
}

let sessionDiscard = false;
export async function flushSession(o) {
  clearTimeout(sessionTimer);
  if (!ctx.cur || !ctx.S) return;
  const view = ctx.view;
  // "exit without saving": unsaved work is dropped from the session instead of coming back next launch
  if (o && o.discard === true) sessionDiscard = true; // sticky: late blur/unload flushes must not bring the work back
  const discard = sessionDiscard;
  const list = discard ? ctx.docs.filter((d) => d.path) : ctx.docs;
  const payload = {
    v: 1,
    active: Math.max(0, list.indexOf(ctx.cur)),
    docs: list.map((d) => {
      const st = stateOf(d);
      const keepText = !discard && (d.dirty || !d.path);
      return {
        path: d.path, untitledN: d.untitledN, encoding: d.encoding, eol: d.eol, mode: d.mode, modeManual: d.modeManual,
        readOnly: d.readOnly, dirty: discard ? false : d.dirty, meta: discard ? false : d.meta,
        text: keepText ? st.doc.toString() : null,
        anchor: st.selection.main.anchor, head: st.selection.main.head,
        scroll: d === ctx.cur ? view.scrollDOM.scrollTop : d.scroll,
      };
    }),
  };
  await api.save_session(payload);
}

async function restoreSession(session) {
  const S = ctx.S;
  if (!S.restoreSession || !session || !Array.isArray(session.docs) || !session.docs.length) return false;
  let made = 0;
  for (const s of session.docs) {
    let d = null;
    if (s.path) {
      const r = await api.read_file(s.path, s.encoding || null, true);
      if (r && !r.error) {
        d = createDoc({ text: r.text, path: s.path, encoding: r.encoding, eol: r.eol || s.eol, mtime: r.mtime, size: r.size, mode: s.mode, modeManual: s.modeManual, readOnly: s.readOnly, activate: false });
        if (s.dirty && typeof s.text === 'string' && s.text !== r.text) {
          d.state = d.state.update({ changes: { from: 0, to: d.state.doc.length, insert: s.text } }).state;
          d.dirty = true;
        }
      } else if (typeof s.text === 'string') {
        d = createDoc({ text: s.text, path: s.path, encoding: s.encoding, eol: s.eol, mode: s.mode, modeManual: s.modeManual, readOnly: s.readOnly, activate: false });
        d.saved = d.state.update({ changes: { from: 0, to: d.state.doc.length, insert: '' } }).state.doc;
        d.dirty = true;
        d.conflict = 'deleted';
      }
    } else if (typeof s.text === 'string' && s.text.length) {
      d = createDoc({ text: s.text, encoding: s.encoding, eol: s.eol, mode: s.mode, modeManual: s.modeManual, readOnly: s.readOnly, activate: false });
      d.untitledN = s.untitledN || d.untitledN;
      d.saved = d.state.update({ changes: { from: 0, to: d.state.doc.length, insert: '' } }).state.doc;
      d.dirty = true;
    }
    if (d) {
      if (s.meta) { d.meta = true; d.dirty = true; }
      const len = d.state.doc.length;
      d.state = d.state.update({ selection: { anchor: Math.min(s.anchor || 0, len), head: Math.min(s.head || 0, len) } }).state;
      d.scroll = s.scroll || 0;
      made++;
    }
  }
  if (!made) return false;
  const idx = Math.max(0, Math.min(ctx.docs.length - 1, session.active || 0));
  activate(ctx.docs[idx]);
  return true;
}

/* ---------- dirty count & autosave ---------- */
let dirtyTimer = null;
function notifyDirty() {
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(() => api.set_dirty(ctx.docs.filter((d) => d.dirty).length), 200);
}

let autosaveTimer = null;
function setupAutosave() {
  clearInterval(autosaveTimer);
  const S = ctx.S;
  if (S.autosave !== 'delay') return;
  autosaveTimer = setInterval(async () => {
    for (const d of ctx.docs) {
      if (d.path && d.dirty && !d.conflict && !d.readOnly) await saveDoc(d, { silent: true });
    }
  }, Math.max(5, S.autosaveSeconds) * 1000);
}

/* ---------- closing / quitting ---------- */
let quitting = false;
async function quitApp() {
  if (quitting) return;
  quitting = true;
  try { await quitFlow(); } finally { quitting = false; }
}

async function quitFlow() {
  const dirty = ctx.docs.filter((d) => d.dirty);
  let discard = false;
  if (ctx.S.askBeforeExit && dirty.length) {
    const r = await confirmDialog({
      title: L('تغييرات غير محفوظة', 'Unsaved changes'),
      message: L(`لديك ${num(dirty.length)} تبويب فيه تعديلات غير محفوظة.`, `You have ${num(dirty.length)} tab(s) with unsaved changes.`),
      buttons: [
        { label: L('حفظ الكل والخروج', 'Save all and exit'), value: 'save', primary: true },
        { label: L('خروج بدون حفظ', 'Exit without saving'), value: 'discard' },
        { label: L('إلغاء', 'Cancel'), value: null },
      ],
    });
    if (!r) return;
    if (r === 'save') {
      for (const d of dirty) if (!(await saveDoc(d, { silent: true }))) return;
    } else discard = true;
  }
  await flushSettings();
  await flushSession({ discard });
  await api.quit();
}

/* ---------- editor hooks ---------- */
function placeholderEl() {
  const kb = (k) => h('kbd', k);
  return h('div.hint-card',
    L('ابدأ الكتابة هنا…', 'Start typing…'), h('br'),
    kb('Ctrl+Shift+P'), ' ' + L('كل الأوامر', 'all commands') + '  ·  ',
    kb('Ctrl+O'), ' ' + L('فتح ملف', 'open file') + '  ·  ',
    kb('Ctrl+F'), ' ' + L('بحث', 'find'));
}

function onUpdate(u) {
  const d = ctx.cur;
  if (!d) return;
  if (u.docChanged) {
    recalcDirty(d);
    scheduleSession();
    schedulePreview();
    scheduleCounts();
    ctx.find.onDocChanged();
  }
  if (u.docChanged || u.selectionSet) scheduleStatus();
}

/* ---------- boot ---------- */
export async function start() {
  const info = await api.init();
  const saved = (info && info.settings) || {};
  ctx.S = { ...structuredClone(DEFAULTS), ...saved, search: { ...DEFAULTS.search, ...(saved.search || {}) } };
  ctx.version = (info && info.version) || ctx.version;
  ctx.platform = (info && info.platform) || '';
  setLang(ctx.S.lang);
  applySettings({ sync: false });

  ctx.editor = createEditor($('#editorHost'), {
    onUpdate,
    searchExtension,
    placeholderEl,
    onContext: (e) => showContextMenu(e),
    onZoom: (dir) => setSetting('fontSize', Math.max(10, Math.min(60, ctx.S.fontSize + dir))),
  });
  ctx.view = ctx.editor.view;
  ctx.find = createFind({ host: $('#findPanel'), getView: () => ctx.view, prefs: ctx.S.search, onPrefs: persistSettings, toast });

  Object.assign(A, {
    setSetting, resetSettings, openPaths, activate, listTabs: () => ctx.docs.map((d) => ({ doc: d, name: docName(d), path: d.path })),
    setDocEncoding, setDocEol, setDocMode, reopenWithEncoding: (d, enc) => reloadDoc(d, enc), reloadDoc, renameDoc, toggleReadOnly,
    saveDoc, closeDoc, closeMany, openPath, quit: quitApp, setPreview, isPreviewOn, textOf, docName, createDoc,
    scrollEffect: (pos) => EditorView.scrollIntoView(pos, { y: 'center' }),
    openDataFolder: () => api.open_data_dir(),
    copyText: async (t) => { try { if (await hasBackend()) { const r = await api.copy_text(t); if (r) return true; } await navigator.clipboard.writeText(t); return true; } catch (e) { return false; } },
    pasteText: async () => { try { if (await hasBackend()) { const t = await api.paste_text(); if (typeof t === 'string') return t; } return await navigator.clipboard.readText(); } catch (e) { return null; } },
    syncCurrent, rebuildChrome, saveAll: async () => { for (const d of ctx.docs) if (d.dirty) await saveDoc(d, { silent: true }); toast(L('تم حفظ كل التبويبات', 'All tabs saved')); },
  });

  registerCommands();
  installKeyboard();
  renderMenubar();
  renderQuick();

  const restored = await restoreSession(info && info.session);
  if (!restored) createDoc();
  if (info && info.args && info.args.length) await openPaths(info.args);

  $('#newTab').innerHTML = icon('plus');
  $('#newTab').onclick = () => runCommand('file.new');
  $('#tabbar').addEventListener('dblclick', (e) => { if (e.target.id === 'tabbar' || e.target.id === 'tabs') runCommand('file.new'); });
  $('#tabs').addEventListener('wheel', (e) => { if (e.deltaY) { $('#tabs').scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  $('#previewBody').addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) api.open_url(href);
  });

  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (await hasBackend() && !(info && info.dev)) return; // the desktop shell opens dropped files itself
    for (const f of [...(e.dataTransfer?.files || [])]) {
      const text = await f.text();
      createDoc({ text, mode: modeForPath(f.name) });
    }
  });

  window.addEventListener('focus', checkExternal);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkExternal(); else { flushSession(); flushSettings(); } });
  window.addEventListener('blur', () => { flushSession(); flushSettings(); });
  window.addEventListener('beforeunload', () => { flushSession(); flushSettings(); });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (ctx.S.theme === 'system') { applySettings(); rebuildChrome(); } });

  if (ctx.S.alwaysOnTop) api.window_op('on_top', true);
  setupAutosave();
  scheduleCounts();
  renderStatus();
  updateTitle();
  notifyDirty();

  window.App = {
    openPaths: (paths) => openPaths(paths),
    onCloseRequested: () => quitApp(),
    flushSession: () => flushSession(),
    hasDirty: () => ctx.docs.some((d) => d.dirty),
    state: () => ({ docs: ctx.docs.map((d) => ({ name: docName(d), path: d.path, dirty: d.dirty, mode: d.mode, encoding: d.encoding, eol: d.eol })), active: ctx.docs.indexOf(ctx.cur) }),
    runCommand,
    ctx,
  };
  document.documentElement.dataset.ready = '1';
}
