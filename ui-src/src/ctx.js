// Shared mutable context so feature modules (dialogs, menus) can reach app state without import cycles.
export const ctx = {
  S: null,            // settings
  docs: [],           // open documents
  cur: null,          // active document
  view: null,         // CodeMirror EditorView
  editor: null,       // editor controller
  find: null,         // find panel controller
  cmds: new Map(),    // command registry
  app: {},            // functions assigned by app.js for the dialogs to call
  version: '1.0.0',
  platform: '',
};

export const ENCODINGS = [
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'utf-8-sig', label: 'UTF-8 with BOM' },
  { id: 'utf-16-le', label: 'UTF-16 LE' },
  { id: 'utf-16-be', label: 'UTF-16 BE' },
  { id: 'cp1256', label: 'Windows-1256 (Arabic)' },
  { id: 'iso8859_6', label: 'ISO-8859-6 (Arabic)' },
  { id: 'cp720', label: 'DOS-720 (Arabic)' },
  { id: 'cp1252', label: 'Windows-1252 (Western)' },
  { id: 'latin_1', label: 'ISO-8859-1 (Latin-1)' },
];

export const encLabel = (id) => (ENCODINGS.find((e) => e.id === id) || { label: id }).label;

export const EOLS = [
  { id: 'crlf', label: 'Windows (CRLF)' },
  { id: 'lf', label: 'Unix / macOS (LF)' },
  { id: 'cr', label: 'Classic Mac (CR)' },
];
