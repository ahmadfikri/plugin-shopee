/* gahwapack.js — "🎞 Gahwa Pack": one click on a Shopee PRODUCT page downloads
 * everything the Gahwa image-to-video engine needs, into one folder:
 *
 *   ~/Downloads/gahwa/<yymmdd>-<slug>/
 *       img01.jpg … imgNN.jpg   full-resolution gallery + variant images
 *       video.mp4               the listing video, when it is a direct mp4
 *       gahwa_job.json          product text + ready hook/captions/CTA for Gahwa
 *
 * Rules kept (plugin is self-contained): reads the RENDERED DOM only — no
 * Shopee API, no fetch of Shopee data. The actual file transfer is done by
 * chrome.downloads in src/background.js (the browser's own downloader).
 * Text NEVER carries price or rating (Fikri's no-price / no-rating rules):
 * any line mentioning them is dropped before it reaches the job file.
 */
(function (global) {
  "use strict";

  const BANNED = /(\brp\.?\s?\d|\b\d+([.,]\d+)?\s?(rb|ribu|jt|juta|k)\b|harga|diskon|murah|terjangkau|promo|potongan|hemat|cashback|gratis\s?ongkir|\d+\s?%|rating|bintang|ulasan|review|terjual|\bsold\b|voucher|flash\s?sale|cod\b)/i;
  const NOISE = /^(cod|ready|readystock|ready stock|original|ori|termurah|murah|promo|new|baru|hot|best|seller|bestseller|grosir|import|premium|viral|terlaris|free|gratis)$/i;
  const FEATURE = /(bahan|material|ukuran|size|dimensi|panjang|lebar|tebal|tahan|anti|waterproof|water ?proof|fitur|cocok|mudah|praktis|isi|warna|motif|desain|model|lembut|kuat|awet|elastis|ringan|bisa|dapat)/i;

  function clean(t) {
    return String(t || "").replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF]/gu, " ")
      .replace(/[【】\[\]{}<>|•★✓✔❤]/g, " ").replace(/\s+/g, " ").trim();
  }
  function safe(t) { return t && !BANNED.test(t) ? t : null; }

  function root() {
    return document.querySelector("[class*='product-briefing' i]") ||
           document.querySelector("main") || document.body;
  }

  // Shopee CDN: https://down-id.img.susercontent.com/file/<hash>[_tn][@resize…][.webp]
  // -> canonical full-size https://…/file/<hash>
  const CDN = /(https?:\/\/[^\/"'\s)]*susercontent\.com\/file\/)([A-Za-z0-9][\w.-]*?)(?:_tn)?(?:@[^"'\s)?]*)?(?:\.webp)?(?=[?"'\s)]|$)/;
  function canon(u) {
    const m = String(u || "").match(CDN);
    return m ? { url: m[1] + m[2], key: m[2] } : null;
  }

  function collectImages() {
    const r = root();
    const seen = new Map();
    const add = (u, el) => {
      if (el && el.closest && el.closest("[class*='rating' i], [class*='avatar' i], [class*='shop-' i], [class*='voucher' i]")) return;
      const c = canon(u);
      if (c && !seen.has(c.key)) seen.set(c.key, c.url);
    };
    r.querySelectorAll("img").forEach((img) => {
      const w = img.getBoundingClientRect ? img.getBoundingClientRect().width : 100;
      if (w && w < 30) return;                    // badges / icons
      add(img.currentSrc || img.src, img);
      (img.srcset || "").split(",").forEach((s) => add(s.trim().split(" ")[0], img));
    });
    r.querySelectorAll("[style*='susercontent']").forEach((el) => {
      const m = (el.getAttribute("style") || "").match(/url\(["']?([^"')]+)/);
      if (m) add(m[1], el);
    });
    return [...seen.values()];
  }

  function variants() {
    const out = [];
    root().querySelectorAll("button[class*='variation' i], button[aria-label][class*='product-variation' i]")
      .forEach((b) => {
        const t = clean(b.getAttribute("aria-label") || b.textContent);
        if (t && t.length <= 40 && safe(t) && !out.includes(t)) out.push(t);
      });
    return out.slice(0, 12);
  }

  function description() {
    const heads = [...document.querySelectorAll("h2, h3, div, span")].filter((n) =>
      /^(deskripsi produk|product description)$/i.test((n.textContent || "").trim()));
    for (const h of heads) {
      const box = h.parentElement;
      if (!box) continue;
      // innerText keeps <br>/<p> line breaks; textContent keeps raw newlines in
      // white-space:pre-wrap text. Use whichever yields more lines.
      const a = box.innerText || "", b = box.textContent || "";
      const txt = b.split("\n").length > a.split("\n").length ? b : a;
      const body = txt.replace(/^(deskripsi produk|product description)/i, "").trim();
      if (body.length > 20) return body.slice(0, 4000);
    }
    return "";
  }

  function features(desc) {
    const lines = desc.split(/\n|(?<=[.!])\s+/).map(clean).filter(Boolean);
    const out = [];
    for (const l of lines) {
      if (l.length < 8 || l.length > 90 || !FEATURE.test(l) || !safe(l)) continue;
      const s = l.replace(/^[-–:*\d.)\s]+/, "");
      if (s && !out.includes(s)) out.push(s);
      if (out.length >= 8) break;
    }
    return out;
  }

  function shortName(name) {
    const words = clean(name).split(" ").filter((w) => w.length > 1 && !NOISE.test(w) && !BANNED.test(w));
    return words.slice(0, 3).join(" ");
  }

  // ≤3 words per caption so Gahwa can morph/reveal it cleanly
  function short(t, n) { return clean(t).split(" ").slice(0, n || 3).join(" "); }

  function slug(t) {
    return (clean(t).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "")
      .trim().replace(/\s+/g, "-").slice(0, 40)) || "produk";
  }

  function collect() {
    const d = (global.RMDetailScrape && global.RMDetailScrape.scrapeDetail()) || {};
    const name = clean(d.name || (document.querySelector("h1") || {}).textContent || document.title);
    const images = collectImages();
    const vid = global.RMVideo ? global.RMVideo.findVideo() : { mp4: [], m3u8: [] };
    const desc = description();
    const feats = features(desc);
    const vars = variants();
    const sn = shortName(name) || "Nemu ini";
    const capPool = [...vars.map((v) => short(v)), ...feats.map((f) => short(f, 3))]
      .filter((c) => c && safe(c));
    const now = new Date();
    const ymd = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, "0") +
                String(now.getDate()).padStart(2, "0");
    return {
      folder: "gahwa/" + ymd + "-" + slug(sn),
      images,
      video: { mp4: vid.mp4[0] || null, m3u8: vid.m3u8[0] || null },
      job: {
        engine: "gahwa", version: 1, created_at: now.toISOString(),
        source_url: location.href.split("?")[0],
        product: { name: safe(name) ? name : sn, short_name: sn, variants: vars, features: feats,
                   description_excerpt: desc.split("\n").map(clean).filter(safe).join("\n").slice(0, 1200) },
        suggest: {
          hook: ["Nemu ini!", short(sn)],
          captions: capPool.slice(0, 6),
          cta: "Link di bio",
          duration: 15
        }
      }
    };
  }

  // Ask the background worker to download everything. Returns {ok, files, error}.
  function download() {
    const p = collect();
    const files = p.images.slice(0, 12).map((u, i) => ({
      url: u, filename: p.folder + "/img" + String(i + 1).padStart(2, "0") + ".jpg" }));
    if (p.video.mp4) files.push({ url: p.video.mp4, filename: p.folder + "/video.mp4" });
    p.job.images = files.filter((f) => /\/img\d+\.jpg$/.test(f.filename)).map((f) => f.filename.split("/").pop());
    p.job.video = p.video.mp4 ? { file: "video.mp4" } : (p.video.m3u8 ? { hls_url: p.video.m3u8 } : null);
    if (!files.length) return Promise.resolve({ ok: false, error: "Tidak ada gambar produk yang terbaca di halaman ini." });
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "gahwa-pack", folder: p.folder, files, job: p.job }, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(Object.assign({ folder: p.folder, images: p.job.images.length, video: !!p.job.video }, res));
      });
    });
  }

  global.RMGahwa = { collect, download, canon, features, shortName, BANNED };
})(typeof window !== "undefined" ? window : globalThis);
