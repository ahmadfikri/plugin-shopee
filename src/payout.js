/* payout.js — read Shopee Affiliate payout pages (v0.9.31).
 *
 * affiliate.shopee.co.id/payment/... "Payout Details" shows what ACTUALLY got
 * paid: eligible income per completed-commission day, the WHT withheld and the
 * after-tax amount. That is the only ground truth for "untung bersih": the
 * commission report mixes in Pending orders that may still be cancelled.
 *
 * Reads the rendered page TEXT (class names are obfuscated and change), keeps a
 * history in chrome.storage.local (key rm_payouts) and exports it as a file.
 * Never stores the bank name or account number. */
(function (global) {
  "use strict";
  const KEY = "rm_payouts";

  const num = (s) => {
    const m = String(s || "").replace(/\s/g, "").match(/-?Rp?-?[\d.,]+/i);
    if (!m) return null;
    const neg = /-/.test(m[0]);
    const v = parseInt(m[0].replace(/[^\d]/g, ""), 10);
    return Number.isFinite(v) ? (neg ? -v : v) : null;
  };
  const dmy = (s) => { const m = /(\d{2})-(\d{2})-(\d{4})/.exec(s || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

  function isPayoutPage(loc) {
    const l = loc || global.location;
    return !!l && /affiliate\.shopee\.co\.id$/i.test(l.hostname) && /^\/payment/i.test(l.pathname);
  }

  // Parse the visible text of a Payout Details page. Labels exist in English
  // and Indonesian UI; both are matched.
  function parseDetail(text) {
    const t = String(text || "");
    const grab = (re) => { const m = re.exec(t); return m ? m[1] : null; };
    const id = grab(/Payout\s*id\s*:?\s*(\d{6,})/i) || grab(/ID\s*Pembayaran\s*:?\s*(\d{6,})/i);
    if (!id) return null;
    const lineVal = (re) => { const m = re.exec(t); return m ? num(m[1]) : null; };
    const payout = lineVal(/(?:Payout Amount\s*\(After Tax\)|Jumlah Pembayaran\s*\(Setelah Pajak\))\s*:?[^\dR-]*(-?Rp\s?[\d.,]+)/i);
    const eligible = lineVal(/(?:Eligible Total Income|Total Pendapatan(?: yang)? Memenuhi Syarat)\s*:?[^\dR-]*(-?Rp\s?[\d.,]+)/i);
    let wht = lineVal(/(?:WHT Amount|Jumlah PPh|Potongan Pajak)\s*:?[^\dR-]*(-?Rp\s?[\d.,]+)/i);
    if (wht != null) wht = Math.abs(wht);
    const days = [];
    const re = /(?:Commission Completed on|Komisi Selesai (?:pada|tanggal))\s*(\d{2}-\d{2}-\d{4})\s*(Rp\s?[\d.,]+)/gi;
    let m;
    while ((m = re.exec(t))) days.push({ date: dmy(m[1]), amount: num(m[2]) });
    const created = dmy(grab(/(?:Payout Created Time|Waktu Pembayaran Dibuat)\s*:?\s*(\d{2}-\d{2}-\d{4})/i));
    const paidAt = dmy(grab(/(?:Payment Time|Waktu Pembayaran)\s*:?\s*(\d{2}-\d{2}-\d{4})/i));
    const status = /\bPaid\b|Dibayar|Berhasil/i.test(t) ? "paid" : (/Pending|Diproses|Processing/i.test(t) ? "pending" : "unknown");
    const sumDays = days.reduce((a, d) => a + (d.amount || 0), 0);
    return {
      payoutId: id, created, paidAt, status, payout, eligible, wht,
      whtRate: eligible ? +(wht / eligible).toFixed(4) : null,
      days, daysSum: sumDays,
      consistent: eligible != null && Math.abs(sumDays - eligible) <= 2 &&
        (payout == null || wht == null || Math.abs(eligible - wht - payout) <= 2),
    };
  }

  function getAll() {
    return new Promise((r) => chrome.storage.local.get(KEY, (o) => r(o[KEY] || {})));
  }
  function save(rec) {
    return getAll().then((all) => {
      all[rec.payoutId] = Object.assign({ savedAt: new Date().toISOString() }, rec);
      return new Promise((r) => chrome.storage.local.set({ [KEY]: all }, () => r(all)));
    });
  }

  function summary(all) {
    const list = Object.values(all || {}).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    const tot = list.reduce((a, p) => ({ payout: a.payout + (p.payout || 0), eligible: a.eligible + (p.eligible || 0), wht: a.wht + (p.wht || 0) }),
      { payout: 0, eligible: 0, wht: 0 });
    const covered = list.flatMap((p) => p.days.map((d) => d.date)).filter(Boolean).sort();
    return { count: list.length, list, ...tot, whtRate: tot.eligible ? tot.wht / tot.eligible : null,
      firstDay: covered[0] || null, lastDay: covered[covered.length - 1] || null };
  }

  // CSV: one row per completed-commission day (joins to the dashboard by date).
  function toCsv(all) {
    const rows = [["payout_id", "payout_created", "paid_at", "commission_completed_on", "amount", "payout_after_tax", "eligible", "wht"]];
    for (const p of summary(all).list) {
      for (const d of p.days) rows.push([p.payoutId, p.created, p.paidAt, d.date, d.amount, p.payout, p.eligible, p.wht]);
    }
    return rows.map((r) => r.map((v) => (v == null ? "" : String(v))).join(",")).join("\n") + "\n";
  }

  global.RMPayout = { isPayoutPage, parseDetail, getAll, save, summary, toCsv, KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = global.RMPayout;
})(typeof window !== "undefined" ? window : this);
