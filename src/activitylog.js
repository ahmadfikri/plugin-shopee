/* activitylog.js — black-box recorder for the plugin (v0.9.18).
 *
 * Fikri: "catat semua log activity, semua action dan semua aktifitas klik saya,
 * nanti dari log itu kamu bisa analisa kalau ada error".
 *
 * Records, into ONE ring buffer in chrome.storage.local (key rm_activity_log):
 *   - every click on the page (plugin panel AND Shopee page): what element,
 *     its text, its classes, whether it was inside the plugin
 *   - plugin events: bulk-scan start/progress/end, each batch scraped (cards
 *     found -> parsed -> scored -> stored), shortlist renders (how many rows
 *     shown vs total, which filter), panel rebuilds, 0-product diagnostics
 *   - every "RM:" console line the plugin already prints
 *   - JS errors and unhandled promise rejections
 *   - URL changes
 * Export = a NEW JSON file (riset-activitylog-<ts>.json) via the panel button.
 *
 * Privacy: only the value of the plugin's own inputs and the Shopee product
 * SEARCH box is recorded. Other page inputs (and any password field) are never
 * read. Self-contained: nothing leaves the browser.
 */
(function (global) {
  "use strict";

  const KEY = "rm_activity_log";
  const MAX = 3000;              // ring buffer size (oldest dropped first)
  const FLUSH_MS = 1500;

  let buf = [];
  let loaded = false;
  let dirty = false;
  let flushTimer = null;
  const session = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function hasStorage() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }

  // Load existing log once; anything logged before load completes is merged.
  const ready = new Promise((resolve) => {
    if (!hasStorage()) { loaded = true; resolve(); return; }
    try {
      chrome.storage.local.get(KEY, (o) => {
        void (chrome.runtime && chrome.runtime.lastError);
        const old = (o && o[KEY] && o[KEY].entries) || [];
        buf = old.concat(buf).slice(-MAX);
        loaded = true;
        resolve();
      });
    } catch (_) { loaded = true; resolve(); }
  });

  function flush() {
    flushTimer = null;
    if (!dirty || !hasStorage() || !loaded) return;
    dirty = false;
    try {
      chrome.storage.local.set({ [KEY]: { entries: buf.slice(-MAX), updatedAt: Date.now() } },
        () => { void (chrome.runtime && chrome.runtime.lastError); });
    } catch (_) { /* extension context invalidated after reload — ignore */ }
  }

  function schedule() {
    dirty = true;
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  }

  function clip(s, n) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > (n || 120) ? s.slice(0, n || 120) + "…" : s;
  }

  // Keep entries small and JSON-safe.
  function safe(data) {
    if (data == null) return undefined;
    try {
      const s = JSON.stringify(data, (k, v) =>
        typeof v === "string" && v.length > 400 ? v.slice(0, 400) + "…" : v);
      return s && s.length > 4000 ? { truncated: s.slice(0, 4000) } : JSON.parse(s);
    } catch (_) { return { unserializable: String(data).slice(0, 200) }; }
  }

  function log(type, data) {
    const e = { t: new Date().toISOString(), s: session, type: String(type) };
    const d = safe(data);
    if (d !== undefined) e.d = d;
    buf.push(e);
    if (buf.length > MAX + 200) buf = buf.slice(-MAX);
    schedule();
    return e;
  }

  // Short, human-readable description of a clicked element.
  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    const plugin = !!(el.closest && el.closest(".rm-panel, .rm-modal-bg, .rm-diag, .rm-sl"));
    const btn = (el.closest && el.closest("button, a, [role='button'], [role='tab'], li, label")) || el;
    const cls = typeof btn.className === "string" ? btn.className : "";
    const out = {
      plugin,
      tag: btn.tagName.toLowerCase(),
      cls: clip(cls, 80),
      text: clip(btn.textContent, 80)
    };
    const id = btn.getAttribute && (btn.getAttribute("data-id") || btn.getAttribute("data-col"));
    if (id) out.dataId = id;
    if (btn.tagName === "A" && btn.href) out.href = clip(btn.href, 160);
    if (btn.disabled) out.disabled = true;
    return out;
  }

  function isSearchBox(el) {
    try {
      return !!(global.RMBulk && global.RMBulk.findSearchInput &&
                global.RMBulk.findSearchInput() === el);
    } catch (_) { return false; }
  }

  function installListeners() {
    if (typeof document === "undefined") return;
    // Capture phase: we see the click even if the page stops propagation.
    document.addEventListener("click", (ev) => {
      try { log("click", describe(ev.target)); } catch (_) {}
    }, true);

    document.addEventListener("change", (ev) => {
      try {
        const el = ev.target;
        if (!el || el.type === "password") return;
        const plugin = !!(el.closest && el.closest(".rm-panel, .rm-modal-bg, .rm-sl"));
        if (!plugin && !isSearchBox(el)) return;          // never record other page inputs
        log("input", {
          plugin, cls: clip(el.className, 60),
          value: el.type === "checkbox" ? !!el.checked : clip(el.value, 200)
        });
      } catch (_) {}
    }, true);

    document.addEventListener("keydown", (ev) => {
      try {
        if (ev.key !== "Enter") return;
        const el = ev.target;
        if (el && isSearchBox(el)) log("search-enter", { value: clip(el.value, 200), synthetic: !ev.isTrusted });
      } catch (_) {}
    }, true);

    global.addEventListener && global.addEventListener("error", (ev) => {
      log("js-error", {
        msg: clip(ev.message, 300), src: clip(ev.filename, 160),
        line: ev.lineno, col: ev.colno,
        stack: ev.error && clip(ev.error.stack, 800)
      });
    });
    global.addEventListener && global.addEventListener("unhandledrejection", (ev) => {
      const r = ev.reason;
      log("promise-error", { msg: clip(r && r.message || r, 300), stack: r && clip(r.stack, 800) });
    });

    // Mirror the plugin's own "RM:" console lines into the log.
    try {
      const orig = console.log.bind(console);
      console.log = function () {
        try {
          const first = arguments[0];
          if (typeof first === "string" && first.indexOf("RM:") === 0) {
            log("console", { msg: clip(Array.from(arguments).map((a) =>
              typeof a === "string" ? a : JSON.stringify(a)).join(" "), 400) });
          }
        } catch (_) {}
        return orig.apply(console, arguments);
      };
    } catch (_) {}

    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        log("url", { from: clip(lastUrl, 200), to: clip(location.href, 200) });
        lastUrl = location.href;
      }
    }, 1000);

    // Make sure the tail of a session is not lost on tab close / navigation.
    global.addEventListener && global.addEventListener("pagehide", flush);

    log("page-open", {
      url: clip(location.href, 200),
      version: (chrome && chrome.runtime && chrome.runtime.getManifest &&
                chrome.runtime.getManifest().version) || null,
      ua: clip(navigator.userAgent, 160),
      viewport: global.innerWidth + "x" + global.innerHeight
    });
  }

  function getAll() { return ready.then(() => buf.slice()); }

  function clear() {
    buf = [];
    dirty = false;
    return new Promise((resolve) => {
      if (!hasStorage()) { resolve(); return; }
      chrome.storage.local.remove(KEY, () => {
        void (chrome.runtime && chrome.runtime.lastError);
        resolve();
      });
    });
  }

  // Download the whole log as a NEW plugin-owned JSON file.
  async function exportFile() {
    flush();
    const entries = await getAll();
    const summary = {};
    for (const e of entries) summary[e.type] = (summary[e.type] || 0) + 1;
    const doc = {
      plugin: "syabab-affiliathor",
      version: (chrome && chrome.runtime && chrome.runtime.getManifest &&
                chrome.runtime.getManifest().version) || null,
      exportedAt: new Date().toISOString(),
      count: entries.length,
      summary,
      entries
    };
    const blob = new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "riset-activitylog-" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return entries.length;
  }

  installListeners();
  global.RMLog = { log, getAll, clear, exportFile, flush, KEY, MAX, _describe: describe };
})(typeof window !== "undefined" ? window : this);
