/* storage.js — plugin-local config + data. No external systems, chrome.storage only. */
(function (global) {
  "use strict";

  // All tunables live here and are editable in the Admin Panel.
  const DEFAULT_CONFIG = {
    // --- economics (drive the "Layak Iklan" verdict) ---
    commissionPct: 3.5,        // Shopee affiliate commission % assumption
    breakEvenCPC: 100,         // Rp per click break-even target (Zaki-informed)
    conversionRate: 4.0,       // click -> order %, for value-per-click estimate
    // --- opportunity scoring ---
    saturationTop3Pct: 70,     // >= this % of omset held by top-3 shops => "jenuh"
    momentumMaxAgeMonths: 3,   // listing younger than this ...
    momentumMinPerMonth: 100,  // ... but selling >= this/month => "momentum"
    // DeepSeek AI (caption + tag), off until a key is set.
    // captionPrompt/videoPrompt EMPTY = use the built-in templates in ai.js.
    // Only fill these if you deliberately want to override them.
    ai: {
      enabled: false,
      apiKey: "",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1/chat/completions",
      captionPrompt: "",
      tagPrompt:
        "Sarankan satu sub_id tag pendek (huruf kecil, tanpa spasi, maks 20 char) " +
        "untuk produk Shopee affiliate: {{name}}. Hanya keluarkan tag-nya.",
      videoPrompt: ""
    },
    // --- display ---
    showCharts: true,
    panelCollapsed: false,
    contributorId: "",         // label for collective-intelligence data export
    autoCapture: true          // collect training data automatically, no button press
  };

  const KEYS = { CONFIG: "rm_config", HISTORY: "rm_history", WATCHLIST: "rm_watchlist" };

  // Legacy prompts that shipped as defaults in earlier versions. If a stored
  // config still holds one of these, the user never customised it — it is stale
  // and must NOT override the newer built-in templates in ai.js. (This is why
  // captions kept coming back as "3 variasi" after the template was rewritten.)
  const LEGACY_PROMPT_MARKERS = [
    /Buatkan 3 variasi caption/i,
    /Fokus manfaat, jangan lebay/i
  ];

  function migrate(cfg) {
    if (cfg && cfg.ai && typeof cfg.ai.captionPrompt === "string") {
      const p = cfg.ai.captionPrompt;
      if (p && LEGACY_PROMPT_MARKERS.some((re) => re.test(p))) {
        cfg.ai.captionPrompt = "";   // fall back to the built-in template
      }
    }
    return cfg;
  }

  function getConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(KEYS.CONFIG, (o) => {
        const merged = Object.assign({}, DEFAULT_CONFIG, o[KEYS.CONFIG] || {},
          { ai: Object.assign({}, DEFAULT_CONFIG.ai, (o[KEYS.CONFIG] || {}).ai || {}) });
        resolve(migrate(merged));
      });
    });
  }
  function setConfig(cfg) {
    return new Promise((resolve) =>
      chrome.storage.local.set({ [KEYS.CONFIG]: cfg }, resolve));
  }

  // Watchlist: candidate products the user starred. Exported as a NEW file only.
  function getWatchlist() {
    return new Promise((r) =>
      chrome.storage.local.get(KEYS.WATCHLIST, (o) => r(o[KEYS.WATCHLIST] || [])));
  }
  function addToWatchlist(item) {
    return getWatchlist().then((list) => {
      if (!list.some((x) => x.id === item.id)) list.push(item);
      return new Promise((r) =>
        chrome.storage.local.set({ [KEYS.WATCHLIST]: list }, () => r(list)));
    });
  }

  // History: one snapshot per keyword scan, for trend-over-time.
  function saveSnapshot(snap) {
    return new Promise((r) =>
      chrome.storage.local.get(KEYS.HISTORY, (o) => {
        const h = o[KEYS.HISTORY] || [];
        h.push(snap);
        // keep it bounded — this is a plugin, not a database
        while (h.length > 200) h.shift();
        chrome.storage.local.set({ [KEYS.HISTORY]: h }, () => r(h));
      }));
  }

  global.RMStore = {
    DEFAULT_CONFIG, KEYS,
    getConfig, setConfig,
    getWatchlist, addToWatchlist, saveSnapshot
  };
})(typeof window !== "undefined" ? window : this);
