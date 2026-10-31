document.getElementById("admin").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById("shopee").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://shopee.co.id/search?keyword=tas%20anak%20sekolah" });
});

// Activity log export — works even when the panel never appears on the page.
(function () {
  const KEY = "rm_activity_log";
  const info = document.getElementById("loginfo");
  chrome.storage.local.get(KEY, (o) => {
    const n = ((o[KEY] || {}).entries || []).length;
    if (info) info.textContent = n + " baris log tersimpan";
  });
  document.getElementById("logexp").addEventListener("click", () => {
    chrome.storage.local.get(KEY, (o) => {
      const entries = (o[KEY] || {}).entries || [];
      const summary = {};
      for (const e of entries) summary[e.type] = (summary[e.type] || 0) + 1;
      const doc = { plugin: "syabab-affiliathor", version: chrome.runtime.getManifest().version,
        exportedAt: new Date().toISOString(), count: entries.length, summary, entries };
      const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)],
        { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "riset-activitylog-" + Date.now() + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  });
})();

// TikTok downloader — the real work runs in background.js so it survives the
// popup closing; this only forwards the pasted link and shows the result.
(function () {
  const inp = document.getElementById("ttlink");
  const btn = document.getElementById("ttdl");
  const info = document.getElementById("ttinfo");
  if (!inp || !btn) return;
  // prefill from clipboard when it holds a TikTok link
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then((t) => { if (/tiktok\.com\//i.test(t || "") && !inp.value) inp.value = t.trim(); }).catch(() => {});
  }
  const go = () => {
    const text = inp.value.trim();
    if (!text) { info.textContent = "Paste link TikTok dulu."; return; }
    btn.disabled = true; info.textContent = "⏳ Mengambil kualitas tertinggi…";
    chrome.runtime.sendMessage({ type: "tiktok-download", text }, (r) => {
      btn.disabled = false;
      if (chrome.runtime.lastError || !r) { info.textContent = "❌ " + ((chrome.runtime.lastError || {}).message || "tidak ada respon"); return; }
      info.textContent = r.ok
        ? "✅ " + r.filename + " (" + Math.min(r.width, r.height) + "p " + r.codec + ")" + (r.fallback ? " — cadangan" : "")
        : "❌ " + r.error;
    });
  };
  btn.addEventListener("click", go);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
})();

// v0.9.32: competitor pages remembered by the Ad Library tracker
(function () {
  const btn = document.getElementById("fbtracked");
  const info = document.getElementById("fbtrackinfo");
  if (!btn) return;
  chrome.storage.local.get("rm_fbadlib_track", (o) => {
    const all = o.rm_fbadlib_track || {};
    const n = Object.keys(all).length;
    if (info) info.textContent = n ? n + " page kompetitor dilacak" : "Belum ada. Buka halaman satu pengiklan di Galeri Iklan dulu.";
    if (!n) btn.disabled = true;
  });
  btn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "fbadlib-open-tracked" }, (r) => {
    if (info && r) info.textContent = r.opened + " dari " + r.total + " page dibuka";
  }));
})();
