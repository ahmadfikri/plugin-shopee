/* background.js — service worker. Its only job: perform the downloads for
 * "🎞 Gahwa Pack" (content scripts cannot call chrome.downloads, and the
 * browser's own downloader is not blocked by CORS on Shopee's image CDN).
 * Files land in the user's Downloads folder under gahwa/<folder>/. */
"use strict";

function dl(opts) {
  return new Promise((resolve) => {
    chrome.downloads.download(Object.assign({ conflictAction: "uniquify", saveAs: false }, opts), (id) => {
      resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : { ok: true, id });
    });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || msg.type !== "gahwa-pack") return false;
  (async () => {
    const results = [];
    for (const f of msg.files) results.push(Object.assign({ filename: f.filename }, await dl(f)));
    const json = JSON.stringify(msg.job, null, 1);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    results.push(Object.assign({ filename: msg.folder + "/gahwa_job.json" },
      await dl({ url: "data:application/json;base64," + b64, filename: msg.folder + "/gahwa_job.json" })));
    const failed = results.filter((r) => !r.ok);
    reply({ ok: failed.length === 0, files: results.length, failed });
  })();
  return true; // async reply
});
