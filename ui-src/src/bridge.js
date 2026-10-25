// Bridge to the Python backend (pywebview). Falls back to harmless stubs when opened in a plain browser.

let apiPromise = null;

function waitForApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const have = () => window.pywebview && window.pywebview.api;
    if (have()) return resolve(window.pywebview.api);
    window.addEventListener('pywebviewready', () => resolve(window.pywebview.api), { once: true });
    setTimeout(() => resolve(have() ? window.pywebview.api : null), 5000);
  });
  return apiPromise;
}

const LS = 'sadeem:dev:';
const stubs = {
  async init() {
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem(LS + 'settings') || '{}'); } catch (e) { /* ignore */ }
    return { settings, session: null, args: [], version: 'dev', dataDir: '', platform: 'browser', dev: true };
  },
  async save_settings(s) { try { localStorage.setItem(LS + 'settings', JSON.stringify(s)); } catch (e) { /* ignore */ } return true; },
  async save_session() { return true; },
  async pick_open() { return []; },
  async pick_save() { return null; },
  async stat_files() { return {}; },
};

export const api = new Proxy({}, {
  get(_, name) {
    return async (...args) => {
      const a = await waitForApi();
      if (a && typeof a[name] === 'function') return a[name](...args);
      if (stubs[name]) return stubs[name](...args);
      return null;
    };
  },
});

export const hasBackend = async () => !!(await waitForApi());
