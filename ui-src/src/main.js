import { start } from './app.js';
start().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:20px;color:#f66;background:#000;padding:16px;z-index:999;overflow:auto">${String(e && e.stack || e)}</pre>`); });
