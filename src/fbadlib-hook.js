/* fbadlib-hook.js — runs in the PAGE's MAIN world on facebook.com/ads/library.
 * Ads loaded while scrolling come from /api/graphql. A content script cannot
 * read those responses, so this hook copies any response that mentions
 * "ad_archive_id" to the isolated content script via window.postMessage.
 * It only reads responses; it never changes requests or the page. */
(function () {
  "use strict";
  if (window.__rmFbHook) return;
  window.__rmFbHook = true;
  const TAG = "rm-fbadlib";
  const relay = (url, text) => {
    if (typeof text === "string" && text.indexOf("ad_archive_id") !== -1) {
      window.postMessage({ source: TAG, url: String(url || ""), text }, location.origin);
    }
  };
  const wanted = (u) => /\/api\/graphql|\/ads\/library\/async/i.test(String(u || ""));

  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__rmUrl = u; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    if (wanted(this.__rmUrl)) {
      this.addEventListener("load", () => {
        try { if (this.responseType === "" || this.responseType === "text") relay(this.__rmUrl, this.responseText); } catch (_) {}
      });
    }
    return XS.apply(this, arguments);
  };

  const F = window.fetch;
  if (F) {
    window.fetch = function (input) {
      const p = F.apply(this, arguments);
      try {
        const u = typeof input === "string" ? input : (input && input.url);
        if (wanted(u)) p.then((r) => r.clone().text().then((t) => relay(u, t))).catch(() => {});
      } catch (_) {}
      return p;
    };
  }
})();
