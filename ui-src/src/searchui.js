// Find & replace panel with live highlighting. Matching logic lives in core/search.js.
import { StateField, StateEffect } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { buildSearch, findAll, expandReplacement, nextIndex, prevIndex } from './core/search.js';
import { h, icon } from './ui.js';
import { L, num } from './l10n.js';

const setHighlights = StateEffect.define();
const matchMark = Decoration.mark({ class: 'cm-sdm-match' });
const currentMark = Decoration.mark({ class: 'cm-sdm-current' });

export const searchExtension = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setHighlights)) deco = e.value;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildDecos(matches, cur) {
  if (!matches.length) return Decoration.none;
  let a = 0;
  let b = matches.length;
  if (b > 4000) {
    a = Math.max(0, cur - 2000);
    b = Math.min(matches.length, a + 4000);
  }
  const ranges = [];
  for (let i = a; i < b; i++) ranges.push((i === cur ? currentMark : matchMark).range(matches[i].from, matches[i].to));
  return Decoration.set(ranges, true);
}

export function createFind({ host, getView, prefs, onPrefs, toast }) {
  const st = { open: false, replaceMode: false, matches: [], cur: -1, error: null };
  let els = {};
  let timer = null;

  const view = () => getView();

  function build() {
    const q = h('input', {
      type: 'text', value: prefs.query || '', placeholder: L('بحث…', 'Find…'), autocomplete: 'off', spellcheck: false,
      on: {
        input: () => { prefs.query = q.value; onPrefs(); recompute(true); },
        keydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
        },
      },
    });
    const r = h('input', {
      type: 'text', value: prefs.replace || '', placeholder: L('استبدال بـ…', 'Replace with…'), autocomplete: 'off', spellcheck: false,
      on: {
        input: () => { prefs.replace = r.value; onPrefs(); },
        keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } },
      },
    });
    const tog = (key, label, title) => {
      const b = h('button.tog', {
        type: 'button', title, 'aria-pressed': String(!!prefs[key]),
        on: { click: () => { prefs[key] = !prefs[key]; b.setAttribute('aria-pressed', String(prefs[key])); onPrefs(); recompute(true); } },
      }, label);
      return b;
    };
    const count = h('span.count');
    const toggleReplace = h('button.icon-btn', {
      type: 'button', title: L('إظهار الاستبدال', 'Toggle replace'),
      html: icon('replace'), style: { width: '30px', height: '30px' },
      on: { click: () => { st.replaceMode = !st.replaceMode; layout(); (st.replaceMode ? r : q).focus(); } },
    });
    const row1 = h('div.row', toggleReplace, q,
      tog('caseSensitive', 'Aa', L('مطابقة حالة الأحرف', 'Match case')),
      tog('wholeWord', 'ab', L('كلمة كاملة', 'Whole word')),
      tog('regex', '.*', L('تعبير نمطي (Regex)', 'Regular expression')),
      tog('arabicFuzzy', 'ء', L('تجاهل التشكيل والهمزات (أ إ آ، ى ي، ة ه)', 'Arabic-aware: ignore diacritics and letter variants')),
      count,
      h('button.icon-btn', { type: 'button', title: L('السابق (Shift+F3)', 'Previous (Shift+F3)'), html: icon('up'), style: { width: '30px', height: '30px' }, on: { click: () => go(-1) } }),
      h('button.icon-btn', { type: 'button', title: L('التالي (F3)', 'Next (F3)'), html: icon('down'), style: { width: '30px', height: '30px' }, on: { click: () => go(1) } }),
      h('button.icon-btn', { type: 'button', title: L('إغلاق (Esc)', 'Close (Esc)'), html: icon('x'), style: { width: '30px', height: '30px' }, on: { click: () => close() } }));
    const row2 = h('div.row', { hidden: !st.replaceMode }, r,
      h('button.smallbtn', { type: 'button', on: { click: replaceOne } }, L('استبدال', 'Replace')),
      h('button.smallbtn', { type: 'button', on: { click: replaceAll } }, L('استبدال الكل', 'Replace all')));
    host.replaceChildren(row1, row2);
    els = { q, r, count, row2 };
    host.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    };
  }

  function layout() {
    els.row2.hidden = !st.replaceMode;
  }

  function currentIndexFromSelection() {
    const sel = view().state.selection.main;
    return st.matches.findIndex((m) => m.from === sel.from && m.to === sel.to);
  }

  function paintHighlights() {
    const v = view();
    v.dispatch({ effects: setHighlights.of(st.open ? buildDecos(st.matches, st.cur) : Decoration.none) });
  }

  function updateCount() {
    const n = st.matches.length;
    let txt = '';
    if (st.error) txt = L('خطأ', 'Error');
    else if (prefs.query) txt = n ? (st.cur >= 0 ? `${num(st.cur + 1)} / ${num(n)}` : num(n)) : L('لا نتائج', 'No results');
    els.count.textContent = txt;
    els.q.classList.toggle('bad', !!st.error);
    els.q.title = st.error || '';
  }

  function compute() {
    const { re, error } = buildSearch(prefs);
    st.error = error;
    st.matches = re ? findAll(re, view().state.doc.toString()) : [];
    st.cur = currentIndexFromSelection();
  }

  function select(idx, { scroll = true } = {}) {
    const v = view();
    st.cur = idx;
    if (idx < 0) { paintHighlights(); updateCount(); return; }
    const m = st.matches[idx];
    v.dispatch({
      selection: { anchor: m.from, head: m.to },
      effects: [setHighlights.of(buildDecos(st.matches, idx)), ...(scroll ? [EditorView.scrollIntoView(m.from, { y: 'center' })] : [])],
      userEvent: 'select.search',
    });
    updateCount();
  }

  function recompute(jump) {
    if (!st.open) return;
    compute();
    if (jump && st.matches.length) {
      const idx = nextIndex(st.matches, view().state.selection.main.from);
      select(idx);
    } else {
      paintHighlights();
      updateCount();
    }
  }

  function go(dir) {
    if (!prefs.query) { open({ replace: false }); return; }
    if (!st.open) { st.open = true; host.hidden = false; }
    compute();
    if (!st.matches.length) { paintHighlights(); updateCount(); return; }
    const sel = view().state.selection.main;
    const idx = dir > 0 ? nextIndex(st.matches, sel.to) : prevIndex(st.matches, sel.from);
    const m = st.matches[idx];
    if (dir > 0 && m.from < sel.to && st.matches.length > 1) toast(L('عاد البحث إلى البداية', 'Wrapped to the start'));
    if (dir < 0 && m.to > sel.from && st.matches.length > 1) toast(L('عاد البحث إلى النهاية', 'Wrapped to the end'));
    select(idx);
  }

  function replacementFor(m) {
    return prefs.regex ? expandReplacement(m.m, prefs.replace || '', true) : (prefs.replace || '');
  }

  function replaceOne() {
    compute();
    const idx = currentIndexFromSelection();
    if (idx < 0) { go(1); return; }
    const m = st.matches[idx];
    const ins = replacementFor(m);
    const v = view();
    v.dispatch({
      changes: { from: m.from, to: m.to, insert: ins },
      selection: { anchor: m.from + ins.length },
      userEvent: 'input.replace',
    });
    compute();
    const next = nextIndex(st.matches, m.from + ins.length);
    if (next >= 0) select(next); else { paintHighlights(); updateCount(); }
  }

  function replaceAll() {
    compute();
    if (!st.matches.length) { toast(L('لا نتائج للاستبدال', 'Nothing to replace')); return; }
    const changes = st.matches.map((m) => ({ from: m.from, to: m.to, insert: replacementFor(m) }));
    view().dispatch({ changes, userEvent: 'input.replace' });
    toast(L(`تم استبدال ${num(changes.length)} نتيجة`, `Replaced ${num(changes.length)} matches`));
    compute();
    paintHighlights();
    updateCount();
  }

  function open({ replace = false } = {}) {
    const v = view();
    if (replace) st.replaceMode = true;
    st.open = true;
    host.hidden = false;
    const sel = v.state.selection.main;
    if (!sel.empty && sel.to - sel.from <= 200) {
      const txt = v.state.sliceDoc(sel.from, sel.to);
      if (!txt.includes('\n')) { prefs.query = txt; els.q.value = txt; onPrefs(); }
    }
    layout();
    els.q.focus();
    els.q.select();
    compute();
    paintHighlights();
    updateCount();
  }

  function close() {
    if (!st.open) return;
    st.open = false;
    host.hidden = true;
    st.matches = [];
    paintHighlights();
    view().focus();
  }

  function onDocChanged() {
    if (!st.open) return;
    clearTimeout(timer);
    timer = setTimeout(() => recompute(false), 180);
  }

  function refresh() {
    if (st.open) recompute(false);
  }

  function rebuild() {
    const was = st.open;
    build();
    host.hidden = !was;
    if (was) { layout(); updateCount(); }
  }

  build();
  host.hidden = true;

  return { open, close, go, replaceOne, replaceAll, onDocChanged, refresh, rebuild, isOpen: () => st.open };
}
