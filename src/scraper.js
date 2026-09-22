/* scraper.js — parse Shopee search-result cards from the public DOM.
 * Defensive by design: Shopee changes markup often and runs anti-bot, so every
 * selector is best-effort and a miss returns null rather than throwing. */
(function (global) {
  "use strict";

  // Parse an Indonesian price string like "Rp124.999" or "Rp1.2jt" -> number.
  function parsePrice(txt) {
    if (!txt) return null;
    const t = txt.replace(/rp/i, "").trim().toLowerCase();
    const jt = t.match(/([\d.,]+)\s*jt/);
    if (jt) return Math.round(parseFloat(jt[1].replace(/\./g, "").replace(",", ".")) * 1e6);
    const n = t.replace(/[^\d]/g, "");
    return n ? parseInt(n, 10) : null;
  }

  // "10rb+ Terjual" / "1,8rb Terjual" / "717 Terjual/Bln" -> integer units.
  function parseSold(txt) {
    if (!txt) return null;
    const m = txt.toLowerCase().match(/([\d.,]+)\s*(rb|k|jt)?/);
    if (!m) return null;
    let v = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    if (m[2] === "rb" || m[2] === "k") v *= 1e3;
    if (m[2] === "jt") v *= 1e6;
    return Math.round(v);
  }

  // "Comm Rate 11,5%" -> 11.5
  function parseCommRate(txt) {
    if (!txt) return null;
    const m = txt.match(/([\d.,]+)\s*%/);
    return m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) : null;
  }

  // Try several selectors; return the first non-empty text.
  function pick(el, selectors) {
    for (const s of selectors) {
      const found = el.querySelector(s);
      if (found && found.textContent.trim()) return found.textContent.trim();
    }
    return null;
  }

  // Find product cards. Affiliate offer page uses .ItemCard__contentSection
  // (readable, non-obfuscated). Marketplace selectors kept as fallback.
  function findCards() {
    const sels = [
      ".ItemCard__contentSection",
      "[class*='ItemCard__contentSection']",
      "[data-sqe='item']",
      ".shopee-search-item-result__item",
      "li.shopee-search-item-result__item",
      ".col-xs-2-4"
    ];
    for (const s of sels) {
      const nodes = document.querySelectorAll(s);
      if (nodes.length) return Array.from(nodes);
    }
    return [];
  }

  function parseCard(el) {
    const name = pick(el, [
      ".ItemCard__name", "[class*='ItemCard__name']",
      "[data-sqe='name']", ".line-clamp-2", ".yQmmFK", "div[title]"
    ]);
    const priceTxt = pick(el, [
      ".ItemCardPrice__wrap .price", ".ItemCard__price .price",
      "[class*='ItemCardPrice'] .price", ".ItemCard__price",
      ".hpDKMN", "[class*='price']", "span[aria-label*='Rp']"
    ]);
    const soldTxt = pick(el, [
      ".ItemCardSold__wrap", "[class*='ItemCardSold']",
      ".r6HknA", "[class*='sold']", "div[class*='terjual']"
    ]);
    const commTxt = pick(el, [
      ".commRate", "[class*='commRate']", "[class*='CommRate']"
    ]);
    // link/id: the anchor may sit INSIDE the card, or the card may be WRAPPED by
    // it. The previous version walked up the tree and then called
    // querySelector("a[href]") on each ancestor — so as soon as it reached a
    // container shared by several cards (the results grid), it returned the
    // FIRST anchor in that whole grid. Every product on the page then carried
    // the same href and the same id, and because the shortlist and the dataset
    // both key on id, an entire page collapsed into ONE row ("+1 baru, 11
    // diperbarui"). closest() is the correct tool for the wrapper case: it can
    // only ever return an ancestor of THIS card, never a sibling's anchor.
    const link = (el.querySelector && el.querySelector("a[href]")) ||
                 (el.closest && el.closest("a[href]")) || null;
    const href = link ? link.href : null;
    const idm = (href && href.match(/i\.(\d+)\.(\d+)/)) ||
                (href && href.match(/product_offer\/(\d+)/));
    const price = parsePrice(priceTxt);
    const sold = parseSold(soldTxt);
    if (!name || price == null) return null; // not enough to be useful
    return {
      id: idm ? (idm[2] ? `${idm[1]}.${idm[2]}` : idm[1]) : (href || name),
      name, href, price,
      soldTotal: sold,
      soldTextRaw: soldTxt || "",
      commissionPct: parseCommRate(commTxt),   // REAL commission from affiliate page
      ageMonths: null,
      shop: pick(el, [
        "[class*='shop']", "[class*='Shop']", "[class*='seller']",
        ".shop-name", "[data-sqe='name'] ~ div"
      ]),
      ratingText: pick(el, ["[class*='rating']", "[class*='Rating']"])
    };
  }

  function scrapePage() {
    const keyword = new URLSearchParams(location.search).get("keyword") || "";
    const cards = findCards().map(parseCard).filter(Boolean);
    return { keyword, scrapedAt: Date.now(), products: cards };
  }

  global.RMScraper = { scrapePage, parsePrice, parseSold, findCards, parseCard };
})(typeof window !== "undefined" ? window : this);
