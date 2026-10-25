// CodeMirror 6 setup: extensions, themes bound to CSS variables, per-document state factory.
import { EditorState, Compartment, Prec } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars, highlightWhitespace, highlightTrailingWhitespace, placeholder,
} from '@codemirror/view';
import {
  defaultKeymap, history, historyKeymap, indentWithTab, copyLineDown,
} from '@codemirror/commands';
import {
  syntaxHighlighting, HighlightStyle, bracketMatching, indentUnit, indentOnInput, foldGutter, foldKeymap,
} from '@codemirror/language';
import { highlightSelectionMatches, selectNextOccurrence } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import { getMode } from './languages.js';

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--syn-kw)' },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: 'var(--syn-str)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.integer, t.float], color: 'var(--syn-num)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--syn-com)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName, t.macroName], color: 'var(--syn-fn)' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.name)], color: 'var(--syn-type)' },
  { tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)], color: 'var(--syn-prop)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--syn-kw)' },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4], color: 'var(--syn-fn)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--syn-link)', textDecoration: 'underline' },
  { tag: [t.meta, t.processingInstruction, t.monospace, t.contentSeparator], color: 'var(--syn-meta)' },
  { tag: t.quote, color: 'var(--syn-com)' },
  { tag: [t.punctuation, t.bracket, t.operator, t.separator], color: 'var(--syn-punct)' },
  { tag: t.invalid, color: 'var(--danger)' },
]);

function makeTheme(dark) {
  return EditorView.theme({
    '&': { height: '100%', color: 'var(--ed-text)', backgroundColor: 'var(--ed-bg)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--ed-font)', lineHeight: 'var(--ed-lh)', fontSize: 'var(--ed-size)', overflow: 'auto' },
    '.cm-content': { padding: '20px 0 45vh', caretColor: 'var(--accent)' },
    '.cm-line': { padding: '0 28px' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--ed-gutter)', border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 14px', minWidth: '38px', fontSize: '.74em', fontFamily: "'IBM Plex Mono', Consolas, monospace" },
    '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer', opacity: '.55' },
    '.cm-activeLine': { backgroundColor: 'var(--ed-active-line)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '.cm-selectionBackground': { background: 'var(--ed-selection)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { background: 'var(--ed-selection)' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'rgb(var(--accent-rgb) / .22)', outline: '1px solid rgb(var(--accent-rgb) / .5)' },
    '.cm-nonmatchingBracket': { backgroundColor: 'rgb(255 107 129 / .25)' },
    '.cm-specialChar': { color: 'var(--danger)' },
  }, { dark });
}

// perLineTextDirection only fixes cursor/selection maths; the visual per-line direction must come from CSS.
const autoDirTheme = EditorView.theme({ '.cm-line': { unicodeBidi: 'plaintext', textAlign: 'start' } });

export const FONT_STACKS = {
  plex: "'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif",
  naskh: "'Noto Naskh Arabic', 'IBM Plex Sans Arabic', serif",
  amiri: "'Amiri', 'Noto Naskh Arabic', serif",
  tajawal: "'Tajawal', 'IBM Plex Sans Arabic', sans-serif",
  cairo: "'Cairo', 'IBM Plex Sans Arabic', sans-serif",
  mono: "'Cascadia Mono', Consolas, 'IBM Plex Mono', 'IBM Plex Sans Arabic', monospace",
  system: "'Segoe UI', Tahoma, system-ui, sans-serif",
};

/**
 * @param {HTMLElement} parent
 * @param {{onUpdate:Function, searchExtension:any, onContext:Function, onZoom:Function, placeholderEl:Function}} hooks
 */
export function createEditor(parent, hooks) {
  const C = {
    nums: new Compartment(), wrap: new Compartment(), lang: new Compartment(), ro: new Compartment(),
    dir: new Compartment(), indent: new Compartment(), theme: new Compartment(), ws: new Compartment(),
    brackets: new Compartment(), content: new Compartment(), active: new Compartment(), ph: new Compartment(),
  };

  function dynamic(S, info, uiLang) {
    const ws = [];
    if (S.showWhitespace) ws.push(highlightWhitespace(), highlightTrailingWhitespace());
    const dir = S.textDir === 'auto'
      ? [EditorView.perLineTextDirection.of(true), EditorView.editorAttributes.of({ dir: uiLang === 'ar' ? 'rtl' : 'ltr' }), autoDirTheme]
      : [EditorView.editorAttributes.of({ dir: S.textDir })];
    return {
      nums: S.lineNumbers ? [lineNumbers(), foldGutter({ openText: '⌄', closedText: uiLang === 'ar' ? '‹' : '›' })] : [],
      active: S.highlightLine ? [highlightActiveLine(), highlightActiveLineGutter()] : [],
      wrap: S.wrap ? EditorView.lineWrapping : [],
      lang: getMode(info.mode).ext(),
      ro: EditorState.readOnly.of(!!info.readOnly),
      dir,
      indent: [EditorState.tabSize.of(S.tabSize), indentUnit.of(S.useSpaces ? ' '.repeat(S.tabSize) : '\t')],
      theme: makeTheme(S.isDark),
      ws,
      brackets: S.autoBrackets ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : [],
      content: EditorView.contentAttributes.of({
        spellcheck: S.spellcheck ? 'true' : 'false', autocorrect: 'off', autocapitalize: 'off', 'aria-label': 'editor',
      }),
      ph: placeholder(hooks.placeholderEl),
    };
  }

  const staticExt = [
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSpecialChars(),
    highlightSelectionMatches({ minSelectionLength: 2 }),
    syntaxHighlighting(highlight),
    hooks.searchExtension,
    Prec.high(keymap.of([
      { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
      { key: 'Mod-Shift-d', run: copyLineDown, preventDefault: true },
    ])),
    keymap.of([...foldKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
    EditorView.updateListener.of((u) => hooks.onUpdate(u)),
    EditorView.domEventHandlers({
      wheel(e) {
        if (!e.ctrlKey) return false;
        e.preventDefault();
        hooks.onZoom(e.deltaY < 0 ? 1 : -1);
        return true;
      },
      contextmenu(e) {
        e.preventDefault();
        hooks.onContext(e);
        return true;
      },
    }),
  ];

  const view = new EditorView({ parent, state: EditorState.create({ doc: '' }) });

  function makeState(text, S, info, uiLang) {
    const d = dynamic(S, info, uiLang);
    return EditorState.create({
      doc: text,
      extensions: [
        staticExt,
        C.nums.of(d.nums), C.active.of(d.active), C.wrap.of(d.wrap), C.lang.of(d.lang), C.ro.of(d.ro),
        C.dir.of(d.dir), C.indent.of(d.indent), C.theme.of(d.theme), C.ws.of(d.ws),
        C.brackets.of(d.brackets), C.content.of(d.content), C.ph.of(d.ph),
      ],
    });
  }

  function sync(S, info, uiLang) {
    const d = dynamic(S, info, uiLang);
    view.dispatch({
      effects: Object.keys(C).map((k) => C[k].reconfigure(d[k])),
    });
  }

  return { view, makeState, sync };
}

/**
 * Apply fn(text) to every non-empty selection, or to the whole document when nothing is selected.
 * With {lines:true} the targets are widened to whole lines. Returns the number of changed ranges.
 */
export function transformSelection(view, fn, { lines = false } = {}) {
  const { state } = view;
  const doc = state.doc;
  const ranges = state.selection.ranges.filter((r) => !r.empty);
  let targets;
  const whole = !ranges.length;
  if (whole) {
    targets = [{ from: 0, to: doc.length }];
  } else {
    targets = ranges.map((r) => {
      if (!lines) return { from: r.from, to: r.to };
      const a = doc.lineAt(r.from);
      let end = r.to;
      if (end > r.from && doc.lineAt(end).from === end) end -= 1;
      return { from: a.from, to: doc.lineAt(end).to };
    });
  }
  targets.sort((a, b) => a.from - b.from);
  const merged = [];
  for (const tg of targets) {
    const last = merged[merged.length - 1];
    if (last && tg.from <= last.to) last.to = Math.max(last.to, tg.to);
    else merged.push({ ...tg });
  }
  const changes = [];
  let delta = 0;
  for (const tg of merged) {
    const old = doc.sliceString(tg.from, tg.to);
    const nw = fn(old);
    if (nw !== old) {
      changes.push({ from: tg.from, to: tg.to, insert: nw });
      delta += nw.length - old.length;
    }
  }
  if (!changes.length) return 0;
  const spec = { changes, userEvent: 'input.transform', scrollIntoView: true };
  if (whole) spec.selection = { anchor: Math.min(state.selection.main.head, doc.length + delta) };
  view.dispatch(spec);
  return changes.length;
}

export function insertAtSelection(view, text) {
  view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.insert', scrollIntoView: true });
}
