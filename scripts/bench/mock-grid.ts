/**
 * Mock Google Photos grid for the engine benchmark.
 *
 * A deterministic stand-in that honours the selector pack's contract:
 * `.yDSiEe.uGCjIb.zcLWac` scroll container, virtualised tiles carrying an
 * aria-label with a `.ckGgle[role=checkbox][aria-checked]` and a
 * `a[href*="/photo/"]` link, a `.rtExYb` selected-count banner, a
 * "Move to trash" toolbar button and a confirmation dialog.
 *
 * Latencies (ms) are configurable so a run models a slow or fast server:
 *  - renderDelay: scroll -> tiles painted (virtualised render)
 *  - loadDelay:   near the end of the loaded list -> next chunk arrives
 *  - dialogDelay: toolbar click -> dialog appears
 *  - deleteLatency: confirm click -> photos removed, counter back to 0
 */
export interface MockConfig {
  n: number
  cols: number
  rowH: number
  viewH: number
  buffer: number
  loadChunk: number
  renderDelay: number
  loadDelay: number
  dialogDelay: number
  deleteLatency: number
}

export const DEFAULT_MOCK: Omit<MockConfig, 'n'> = {
  cols: 6,
  rowH: 100,
  viewH: 800,
  buffer: 2,
  loadChunk: 200,
  renderDelay: 40,
  loadDelay: 150,
  dialogDelay: 60,
  deleteLatency: 800,
}

export function mockPageHtml(cfg: MockConfig): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Photos - mock grid</title><style>
body{margin:0;background:#202124;font-family:sans-serif;color:#fff}
#bar{height:48px;display:flex;align-items:center;gap:12px;padding:0 16px}
.yDSiEe.uGCjIb.zcLWac{height:${cfg.viewH}px;overflow:auto;position:relative}
#spacer{position:relative;width:100%}
.t{position:absolute;box-sizing:border-box;padding:2px;width:${(100 / cfg.cols).toFixed(4)}%;height:${cfg.rowH}px}
.t a{display:block;width:100%;height:100%;background:#445}
.ckGgle{position:absolute;top:6px;left:6px;width:18px;height:18px;border:2px solid #fff;border-radius:50%}
.ckGgle[aria-checked=true]{background:#8ab4f8}
[role=dialog]{position:fixed;top:200px;left:200px;width:300px;padding:16px;background:#303134;z-index:10}
</style></head><body>
<div id="bar"><span class="rtExYb">0</span><button aria-label="Move to trash" id="tb" style="display:none">Move to trash</button></div>
<div class="yDSiEe uGCjIb zcLWac" role="main" id="sc"><div id="spacer"></div></div>
<script>
const C = ${JSON.stringify(cfg)};
let items = Array.from({ length: C.n }, (_, i) => i);
let loaded = Math.min(C.loadChunk, items.length);
let loading = false, renderPending = false;
const selected = new Set();
const stats = { checkboxClicks: 0, toolbarClicks: 0, confirmClicks: 0, batches: 0, deleted: 0, maxSelected: 0 };
const sc = document.getElementById('sc'), spacer = document.getElementById('spacer');
const counter = document.querySelector('.rtExYb'), tb = document.getElementById('tb');
const live = new Map();
const pad = (v) => String(v).padStart(2, '0');
const labelOf = (id) => 'Photo - Mar ' + (1 + (id % 28)) + ', 2024, ' + pad(Math.floor(id / 3600)) + ':' + pad(Math.floor(id / 60) % 60) + ':' + pad(id % 60);
function sizeSpacer() { spacer.style.height = Math.ceil(loaded / C.cols) * C.rowH + 'px'; }
function makeTile(idx) {
  const id = items[idx];
  const t = document.createElement('div');
  t.className = 't'; t.dataset.id = String(id);
  t.setAttribute('aria-label', labelOf(id));
  t.style.top = Math.floor(idx / C.cols) * C.rowH + 'px';
  t.style.left = (idx % C.cols) * (100 / C.cols) + '%';
  t.innerHTML = '<a href="./photo/AF1Qip' + id + 'XYZ"></a><div class="ckGgle" role="checkbox" aria-checked="' + selected.has(id) + '"></div>';
  return t;
}
function render() {
  renderPending = false;
  const first = Math.max(0, Math.floor(sc.scrollTop / C.rowH) - C.buffer) * C.cols;
  const last = Math.min(loaded, (Math.ceil((sc.scrollTop + C.viewH) / C.rowH) + C.buffer) * C.cols);
  for (const [idx, el] of live) if (idx < first || idx >= last || el.dataset.id !== String(items[idx])) { el.remove(); live.delete(idx); }
  const frag = document.createDocumentFragment();
  for (let i = first; i < last; i++) if (!live.has(i)) { const t = makeTile(i); live.set(i, t); frag.append(t); }
  spacer.append(frag);
}
function scheduleRender() { if (renderPending) return; renderPending = true; setTimeout(render, C.renderDelay); }
function maybeLoad() {
  if (loading || loaded >= items.length) return;
  if (sc.scrollTop + C.viewH * 2 < Math.ceil(loaded / C.cols) * C.rowH) return;
  loading = true;
  setTimeout(() => { loaded = Math.min(items.length, loaded + C.loadChunk); loading = false; sizeSpacer(); scheduleRender(); maybeLoad(); }, C.loadDelay);
}
function update() {
  counter.textContent = String(selected.size);
  tb.style.display = selected.size ? '' : 'none';
  if (selected.size > stats.maxSelected) stats.maxSelected = selected.size;
}
sc.addEventListener('scroll', () => { scheduleRender(); maybeLoad(); });
document.addEventListener('click', (e) => {
  const c = e.target.closest && e.target.closest('.ckGgle');
  if (!c) return;
  stats.checkboxClicks++;
  const id = Number(c.parentElement.dataset.id);
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  c.setAttribute('aria-checked', String(selected.has(id)));
  update();
}, true);
tb.addEventListener('click', () => {
  stats.toolbarClicks++;
  setTimeout(() => {
    const d = document.createElement('div');
    d.setAttribute('role', 'dialog');
    d.innerHTML = '<p>Move items to trash?</p><button>Cancel</button><button id="cf">Move to trash</button>';
    document.body.append(d);
    d.querySelector('#cf').addEventListener('click', () => {
      stats.confirmClicks++;
      setTimeout(() => {
        const n = selected.size;
        items = items.filter((id) => !selected.has(id));
        selected.clear(); loaded = Math.max(0, loaded - n);
        stats.batches++; stats.deleted += n;
        d.remove(); live.forEach((el) => el.remove()); live.clear();
        sizeSpacer(); update(); scheduleRender(); maybeLoad();
      }, C.deleteLatency);
    });
  }, C.dialogDelay);
});
sizeSpacer(); render();
window.__mock = { stats, remaining: () => items.length, ids: () => items.slice() };
</script></body></html>`
}
