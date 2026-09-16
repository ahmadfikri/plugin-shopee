/* admin.js — bind the Admin Panel form to plugin config in chrome.storage. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const FIELDS = ["commissionPct", "breakEvenCPC", "conversionRate",
    "saturationTop3Pct", "momentumMaxAgeMonths", "momentumMinPerMonth"];

  function load() {
    RMStore.getConfig().then((cfg) => {
      FIELDS.forEach((f) => ($(f).value = cfg[f]));
      $("showCharts").checked = !!cfg.showCharts;
      $("aiEnabled").checked = !!cfg.ai.enabled;
      $("aiApiKey").value = cfg.ai.apiKey || "";
      $("aiModel").value = cfg.ai.model || "";
      $("aiBaseUrl").value = cfg.ai.baseUrl || "";
      $("captionPrompt").value = cfg.ai.captionPrompt || "";
      $("tagPrompt").value = cfg.ai.tagPrompt || "";
      $("contributorId").value = cfg.contributorId || "";
      $("autoCapture").checked = cfg.autoCapture !== false;
    });
  }

  function save() {
    RMStore.getConfig().then((cfg) => {
      FIELDS.forEach((f) => (cfg[f] = parseFloat($(f).value)));
      cfg.showCharts = $("showCharts").checked;
      cfg.ai.enabled = $("aiEnabled").checked;
      cfg.ai.apiKey = $("aiApiKey").value.trim();
      cfg.ai.model = $("aiModel").value.trim();
      cfg.ai.baseUrl = $("aiBaseUrl").value.trim();
      cfg.ai.captionPrompt = $("captionPrompt").value;
      cfg.ai.tagPrompt = $("tagPrompt").value;
      cfg.contributorId = $("contributorId").value.trim();
      cfg.autoCapture = $("autoCapture").checked;
      RMStore.setConfig(cfg).then(() => {
        $("status").textContent = "✓ Tersimpan";
        setTimeout(() => ($("status").textContent = ""), 2000);
      });
    });
  }

  function reset() {
    RMStore.setConfig(JSON.parse(JSON.stringify(RMStore.DEFAULT_CONFIG))).then(load);
  }

  // ---- feedback loop: import / clear the performance snapshot ----
  function renderPerf(snap) {
    const box = $("perfSummary");
    if (!snap) { box.textContent = "Belum ada snapshot — Max CPC masih pakai rumus asumsi."; return; }
    const g = snap.global || {};
    const w = (window.RMPerf ? RMPerf.winners(snap, 4) : []);
    box.innerHTML =
      `<b>Snapshot aktif</b> (${snap.generatedAt || "?"}): ` +
      `${g.clicks || 0} klik · ${g.orders || 0} order · ` +
      `conversion ${g.conversionRate}% · <b>EPC Rp ${g.epc}</b> · ROAS ${g.roas}<br>` +
      `Tag terekam: ${Object.keys(snap.tags || {}).length}` +
      (w.length ? `<br>Winner: ` + w.map((x) =>
        `${x.tag} (EPC Rp ${x.epc}, ROAS ${x.roas})`).join(" · ") : "");
  }

  function perfImport() {
    const raw = $("perfJson").value.trim();
    if (!raw) { $("perfStatus").textContent = "Tempel JSON dulu."; return; }
    let snap;
    try { snap = JSON.parse(raw); }
    catch (e) { $("perfStatus").textContent = "JSON tidak valid: " + e.message; return; }
    RMPerf.save(snap).then(() => {
      $("perfStatus").textContent = "✓ Snapshot diimpor";
      renderPerf(snap);
      setTimeout(() => ($("perfStatus").textContent = ""), 2500);
    }).catch((e) => { $("perfStatus").textContent = e.message; });
  }

  function perfClear() {
    RMPerf.clear().then(() => {
      $("perfJson").value = "";
      $("perfStatus").textContent = "Snapshot dihapus";
      renderPerf(null);
      setTimeout(() => ($("perfStatus").textContent = ""), 2500);
    });
  }

  // ---- training dataset: summary / export / clear ----
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function contributor() {
    return ($("contributorId").value || "anon").trim().replace(/[^\w.-]+/g, "_") || "anon";
  }
  function stamp() { return new Date().toISOString().slice(0, 10); }

  function renderDataset() {
    if (!window.RMDataset) { $("datasetSummary").textContent = "Modul dataset tidak dimuat."; return; }
    RMDataset.all().then((rows) => {
      const n = rows.length;
      if (!n) { $("datasetSummary").textContent = "Dataset kosong. Klik 💾 Simpan Data Training di panel produk untuk mulai mengumpulkan."; return; }
      const withCat = rows.filter((r) => r.category_l1).length;
      const withRating = rows.filter((r) => r.rating != null).length;
      const first = rows.reduce((m, r) => r.first_seen && r.first_seen < m ? r.first_seen : m, rows[0].first_seen || "");
      $("datasetSummary").innerHTML =
        `<b>${n} produk</b> terkumpul · ${withCat} ada kategori · ${withRating} ada rating` +
        (first ? `<br>sejak ${String(first).slice(0,10)}` : "");
    });
  }

  function dsExportJson() {
    RMDataset.all().then((rows) => {
      if (!rows.length) { $("dsStatus").textContent = "Dataset kosong."; return; }
      // stamp each row with contributor so the coordinator can merge by source
      const c = contributor();
      const tagged = rows.map((r) => Object.assign({ contributor: c }, r));
      const payload = {
        contributor: c,
        exported_at: new Date().toISOString(),
        schema: "syabab-affiliathor/training-v1",
        count: tagged.length,
        rows: tagged
      };
      download(`training-${c}-${stamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
      $("dsStatus").textContent = `✓ ${rows.length} baris di-export`;
      setTimeout(() => ($("dsStatus").textContent = ""), 2500);
    });
  }

  function dsExportCsv() {
    RMDataset.all().then((rows) => {
      if (!rows.length) { $("dsStatus").textContent = "Dataset kosong."; return; }
      const c = contributor();
      const tagged = rows.map((r) => Object.assign({ contributor: c }, r));
      download(`training-${c}-${stamp()}.csv`, RMDataset.toCsv(tagged), "text/csv");
      $("dsStatus").textContent = `✓ ${rows.length} baris (CSV)`;
      setTimeout(() => ($("dsStatus").textContent = ""), 2500);
    });
  }

  function dsClear() {
    if (!confirm("Kosongkan seluruh dataset training lokal? Pastikan sudah di-export dulu.")) return;
    RMDataset.clear().then(() => {
      $("dsStatus").textContent = "Dataset dikosongkan";
      renderDataset();
      setTimeout(() => ($("dsStatus").textContent = ""), 2500);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    load();
    if (window.RMPerf) RMPerf.load().then(renderPerf);
    if (window.RMDataset) renderDataset();
    $("save").addEventListener("click", save);
    $("reset").addEventListener("click", reset);
    $("perfImport").addEventListener("click", perfImport);
    $("perfClear").addEventListener("click", perfClear);
    $("dsExportJson").addEventListener("click", dsExportJson);
    $("dsExportCsv").addEventListener("click", dsExportCsv);
    $("dsClear").addEventListener("click", dsClear);
  });
})();
