// DOM helpers: hyperscript, modals, toasts and small form controls.
import { L } from './l10n.js';
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);

/** h('div.cls#id', {on:{click}, dataset:{}, ...attrs}, child, child...) */
export function h(spec, props, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => {
    if (k === '.') el.classList.add(v); else el.id = v;
  });
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && k !== 'list') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/* ---------- toast ---------- */
export function toast(message, opts = {}) {
  const root = $('#toasts');
  const el = h('div.toast', { class: opts.error ? 'err' : '' }, message);
  root.append(el);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, opts.ms || 2600);
}

/* ---------- modal ---------- */
const stack = [];

document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    top.close(null);
  } else if (e.key === 'Enter' && !e.shiftKey && top.enterSubmits) {
    const t = e.target;
    if (t.tagName === 'TEXTAREA' || (t.tagName === 'BUTTON' && !t.classList.contains('primary'))) return;
    if (t.tagName === 'SELECT') return;
    const primary = top.el.querySelector('footer .btn.primary');
    if (primary) { e.preventDefault(); e.stopPropagation(); primary.click(); }
  }
}, true);

export const modalOpen = () => stack.length > 0;

/**
 * @param {{title?:string, body:Node|string, buttons?:Array<{label:string,value?:any,primary?:boolean,danger?:boolean,keep?:boolean,onClick?:Function}>,
 *          width?:number, cls?:string, top?:boolean, enterSubmits?:boolean, onClose?:Function, noHeader?:boolean}} o
 */
export function modal(o) {
  const prevFocus = document.activeElement;
  let done = false;
  let resolve;
  const promise = new Promise((r) => { resolve = r; });

  const body = h('div.body', typeof o.body === 'string' ? h('p', o.body) : o.body);
  const footer = o.buttons && o.buttons.length ? h('footer') : null;
  const dlg = h('div.dlg', { role: 'dialog', 'aria-modal': 'true', style: o.width ? { '--w': o.width + 'px' } : null, class: o.cls || '' },
    o.noHeader ? null : h('header', h('h2', o.title || '')),
    body, footer);
  const scrim = h('div.scrim', { class: o.top ? 'top' : '' }, dlg);
  const ctx = {
    el: dlg, body, promise, enterSubmits: o.enterSubmits !== false,
    close(value = null) {
      if (done) return;
      done = true;
      const i = stack.indexOf(ctx);
      if (i >= 0) stack.splice(i, 1);
      scrim.remove();
      if (o.onClose) o.onClose(value);
      resolve(value);
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
    },
  };
  if (footer) {
    for (const b of o.buttons) {
      const btn = h('button.btn', {
        type: 'button', class: (b.primary ? 'primary ' : '') + (b.danger ? 'danger' : ''),
        on: {
          click: async () => {
            if (b.onClick) { const r = await b.onClick(ctx); if (r === false) return; }
            if (!b.keep) ctx.close(b.value === undefined ? b.label : b.value);
          },
        },
      }, b.label);
      footer.append(btn);
    }
  }
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim && o.dismissable !== false) ctx.close(null); });
  $('#overlay').append(scrim);
  stack.push(ctx);
  const focusEl = dlg.querySelector('[autofocus], input:not([type=checkbox]):not([type=range]), textarea, select') ||
    dlg.querySelector('footer .btn.primary') || dlg.querySelector('footer .btn');
  if (focusEl) setTimeout(() => { focusEl.focus(); if (focusEl.select && focusEl.tagName === 'INPUT') focusEl.select(); }, 0);
  return ctx;
}

export async function confirmDialog({ title, message, buttons }) {
  const m = modal({ title, body: message, buttons, width: 460 });
  return m.promise;
}

export async function promptDialog({ title, label, value = '', placeholder = '', okLabel, validate }) {
  const input = h('input.field', { type: 'text', value, placeholder, autocomplete: 'off', spellcheck: false });
  const err = h('div', { style: { color: 'var(--danger)', fontSize: '12.5px', marginTop: '6px', minHeight: '18px' } });
  const body = h('div', label ? h('label.lbl', { style: { marginTop: 0 } }, label) : null, input, err);
  const m = modal({
    title, body, width: 440,
    buttons: [
      {
        label: okLabel || L('موافق', 'OK'), primary: true, keep: true,
        onClick: (ctx) => {
          const v = input.value;
          const bad = validate ? validate(v) : null;
          if (bad) { err.textContent = bad; input.focus(); return false; }
          ctx.close(v);
          return false;
        },
      },
      { label: L('إلغاء', 'Cancel'), value: null },
    ],
  });
  return m.promise;
}

/* ---------- form controls for settings ---------- */
export function switchEl(checked, onChange) {
  const input = h('input', { type: 'checkbox', checked: !!checked, on: { change: () => onChange(input.checked) } });
  return h('label.sw', input, h('i'));
}

export function segmented(options, value, onChange) {
  const wrap = h('div.seg');
  const render = (v) => {
    wrap.replaceChildren(...options.map((o) => h('button', {
      type: 'button', 'aria-pressed': String(o.value === v),
      on: { click: () => { onChange(o.value); render(o.value); } },
    }, o.label)));
  };
  render(value);
  return wrap;
}

export function selectEl(options, value, onChange) {
  const sel = h('select.field', { on: { change: () => onChange(sel.value) } },
    options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  return sel;
}

export function rangeEl({ min, max, step = 1, value, fmt = (v) => v, onChange }) {
  const out = h('output', fmt(value));
  const input = h('input', {
    type: 'range', min, max, step, value,
    on: { input: () => { out.textContent = fmt(Number(input.value)); onChange(Number(input.value)); } },
  });
  return h('div.range', input, out);
}

export function row(label, hint, control) {
  return h('div.srow', h('div.lab', label, hint ? h('small', hint) : null), control);
}

export { icon };
