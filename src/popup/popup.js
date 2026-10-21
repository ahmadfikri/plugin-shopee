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
