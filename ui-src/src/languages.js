// Syntax modes. Each mode loads its CodeMirror language lazily-free (all bundled) and maps from file extensions.
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';

export const MODES = [
  { id: 'text', ar: 'نص عادي', en: 'Plain text', exts: ['txt', 'text', 'log', 'ini', 'cfg', 'conf', 'srt', 'csv', 'tsv', 'nfo', 'bat', 'cmd', 'ahk', 'ps1'], ext: () => [] },
  { id: 'markdown', ar: 'ماركداون', en: 'Markdown', exts: ['md', 'markdown', 'mdx'], ext: () => markdown() },
  { id: 'json', ar: 'JSON', en: 'JSON', exts: ['json', 'jsonc', 'webmanifest'], ext: () => json() },
  { id: 'html', ar: 'HTML', en: 'HTML', exts: ['html', 'htm', 'xhtml', 'vue', 'svelte'], ext: () => html() },
  { id: 'css', ar: 'CSS', en: 'CSS', exts: ['css', 'scss', 'less'], ext: () => css() },
  { id: 'javascript', ar: 'JavaScript', en: 'JavaScript', exts: ['js', 'mjs', 'cjs', 'jsx'], ext: () => javascript({ jsx: true }) },
  { id: 'typescript', ar: 'TypeScript', en: 'TypeScript', exts: ['ts', 'tsx', 'mts', 'cts'], ext: () => javascript({ jsx: true, typescript: true }) },
  { id: 'python', ar: 'Python', en: 'Python', exts: ['py', 'pyw', 'pyi'], ext: () => python() },
  { id: 'java', ar: 'Java', en: 'Java', exts: ['java'], ext: () => java() },
  { id: 'xml', ar: 'XML', en: 'XML', exts: ['xml', 'svg', 'xaml', 'xsd', 'xslt', 'plist', 'csproj', 'config', 'iss'], ext: () => xml() },
  { id: 'sql', ar: 'SQL', en: 'SQL', exts: ['sql'], ext: () => sql() },
  { id: 'yaml', ar: 'YAML', en: 'YAML', exts: ['yml', 'yaml'], ext: () => yaml() },
];

const byId = new Map(MODES.map((m) => [m.id, m]));
const byExt = new Map();
MODES.forEach((m) => m.exts.forEach((e) => byExt.set(e, m.id)));

export const getMode = (id) => byId.get(id) || byId.get('text');

export function modeForPath(path) {
  if (!path) return 'text';
  const name = path.split(/[\\/]/).pop().toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'text';
  return byExt.get(name.slice(dot + 1)) || 'text';
}
