/* charts.js — tiny dependency-free SVG bar chart. No external libs (self-contained). */
(function (global) {
  "use strict";

  function fmtRp(n) {
    if (n >= 1e9) return "Rp" + (n / 1e9).toFixed(1) + "M";
    if (n >= 1e6) return "Rp" + (n / 1e6).toFixed(1) + "jt";
    if (n >= 1e3) return "Rp" + Math.round(n / 1e3) + "rb";
    return "Rp" + n;
  }
  function fmtNum(n) {
    return (n || 0).toLocaleString("id-ID");
  }

  // buckets: [{lo,hi,units,revenue,count}], metric: 'units'|'revenue'
  function barChart(buckets, metric, label) {
    const W = 420, H = 180, pad = 28;
    const vals = buckets.map((b) => b[metric] || 0);
    const max = Math.max(1, ...vals);
    const bw = (W - pad * 2) / Math.max(1, buckets.length);
    let bars = "";
    buckets.forEach((b, i) => {
      const h = ((b[metric] || 0) / max) * (H - pad * 2);
      const x = pad + i * bw + 3, y = H - pad - h;
      const v = metric === "revenue" ? fmtRp(b[metric]) : fmtNum(b[metric]);
      const names = (b.names && b.names.length)
        ? "\n" + b.names.map((n) => "• " + n.slice(0, 40)).join("\n") : "";
      bars +=
        `<rect x="${x}" y="${y}" width="${bw - 6}" height="${h}" fill="#ee4d2d" rx="2">` +
        `<title>${fmtRp(b.lo)}–${fmtRp(b.hi)}: ${v} (${b.count} produk)${names}</title></rect>` +
        `<text x="${x + (bw - 6) / 2}" y="${y - 3}" font-size="9" text-anchor="middle" fill="#333">${v}</text>`;
    });
    return `<div class="rm-chart"><div class="rm-chart-label">${label}</div>` +
      `<svg viewBox="0 0 ${W} ${H}" width="100%">${bars}` +
      `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#ccc"/></svg></div>`;
  }

  // Horizontal ranked bars WITH product labels — answers "which product, and
  // how much can I pay per click", instead of an abstract price histogram.
  // items: [{label, value, color}]
  function rankedBars(items, label, fmt) {
    if (!items || !items.length) return "";
    const max = Math.max(1, ...items.map((i) => i.value || 0));
    const rows = items.map((i) => {
      const pct = Math.round((i.value || 0) / max * 100);
      const val = fmt === "rp" ? fmtRp(i.value) : fmtNum(i.value);
      return `<div class="rm-rank-row" title="${i.label}">` +
        `<span class="rm-rank-name">${i.label.slice(0, 34)}</span>` +
        `<div class="rm-rank-track"><div class="rm-rank-fill" style="width:${pct}%;background:${i.color || "#ee4d2d"}"></div></div>` +
        `<span class="rm-rank-val">${val}</span></div>`;
    }).join("");
    return `<div class="rm-chart"><div class="rm-chart-label">${label}</div>${rows}</div>`;
  }

  global.RMCharts = { barChart, rankedBars, fmtRp, fmtNum };
})(typeof window !== "undefined" ? window : this);
