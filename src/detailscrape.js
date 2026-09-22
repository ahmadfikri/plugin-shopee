/* detailscrape.js — read a Shopee PRODUCT DETAIL page's RENDERED DOM.
 *
 * Runs ONLY when the user themselves opens a product page (no automation, no
 * fetch, no API) — so Shopee's anti-bot is not triggered. Everything is best-
 * effort with multiple selector fallbacks, because Shopee's markup is partly
 * obfuscated and changes over time; a miss returns null, never throws.
 *
 * Shopee product pages render key facts as visible text near the title:
 *   rating star (e.g. "4.8"), ratings count ("23,8k Ratings"),
 *   sold ("10RB+ Sold"), favorites ("Favorite (6,9k)"), stock ("IN STOCK"),
 *   and a Product Ratings section with per-star filter counts.
 */
(function (global) {
  "use strict";

  function num(txt) {
    if (!txt) return null;
    const m = String(txt).toLowerCase().match(/([\d.,]+)\s*(rb|k|jt|m)?/);
    if (!m) return null;
    let v = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    if (m[2] === "rb" || m[2] === "k") v *= 1e3;
    if (m[2] === "jt" || m[2] === "m") v *= 1e6;
    return Math.round(v);
  }

  function pickText(selectors, re) {
    for (const s of selectors) {
      const nodes = document.querySelectorAll(s);
      for (const n of nodes) {
        const t = (n.textContent || "").trim();
        if (t && (!re || re.test(t))) return t;
      }
    }
    return null;
  }

  // productid from the URL. Two live forms:
  //   /product/<shopid>/<itemid>   (current)
  //   ...-i.<shopid>.<itemid>      (legacy)
  function idsFromUrl() {
    let m = location.pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (m) return { shopid: m[1], itemid: m[2] };
    m = location.pathname.match(/i\.(\d+)\.(\d+)/);
    return m ? { shopid: m[1], itemid: m[2] } : { shopid: null, itemid: null };
  }

  function isProductPage() {
    return /\/product\/\d+\/\d+/.test(location.pathname) ||
           /i\.\d+\.\d+/.test(location.pathname);
  }

  function scrapeDetail() {
    if (!isProductPage()) return null;

    // rating star: stable class product-rating-overview__rating-score
    let rating = null;
    const rTxt = pickText(
      [".product-rating-overview__rating-score", "[class*='rating-score']"],
      /^[0-5]([.,]\d)?$/);
    if (rTxt) rating = parseFloat(rTxt.replace(",", "."));

    const bodyTxt = (document.querySelector("main") || document.body).textContent || "";
    // "23,8kratings" — but the text often runs together as "4.823,8kratings"
    // (rating 4.8 + count 23,8k). Capture only the token immediately before
    // "ratings", allowing a k/rb/jt suffix, and NOT a decimal rating like 4.8.
    const ratingsMatch = bodyTxt.match(/(\d[\d.,]*\s*(?:rb|k|jt))\s*ratings/i)
      || bodyTxt.match(/([\d.,]+)\s*ratings/i);
    const soldMatch = bodyTxt.match(/([\d.,]+\s*(?:rb|k|jt)?\+?)\s*(?:Sold|Terjual)/i);
    const favMatch = bodyTxt.match(/Favorite?\s*\(([\d.,]+\s*(?:rb|k|jt)?)\)/i);

    // per-star breakdown from the stable filter rows: "5 star (20,9k)"
    const stars = [0, 0, 0, 0, 0]; // 1★..5★
    let gotStars = false;
    document.querySelectorAll(
      ".product-rating-overview__filter, [class*='rating-overview__filter'], [class*='ratingFilter']"
    ).forEach((n) => {
      const m = (n.textContent || "").trim().match(/([1-5])\s*(?:star|bintang)\s*\(([\d.,]+\s*(?:rb|k|jt)?)\)/i);
      if (m) { stars[+m[1] - 1] = num(m[2]) || 0; gotStars = true; }
    });

    // Prefer the sum of the star breakdown for total reviews — it's exact and
    // immune to the concatenated-text problem.
    const starsSum = gotStars ? stars.reduce((a, b) => a + b, 0) : null;

    const { shopid, itemid } = idsFromUrl();
    const inStock = /IN STOCK|stok tersedia/i.test(bodyTxt) ? true
      : /OUT OF STOCK|stok habis|produk habis/i.test(bodyTxt) ? false : null;
    return {
      source: "dom-detail",
      shopid, itemid,
      name: ((document.querySelector("h1, [class*='product-briefing'] span, span[class*='attM']") || {}).textContent || "").trim() || null,
      rating,
      totalReviews: starsSum != null ? starsSum : (ratingsMatch ? num(ratingsMatch[1]) : null),
      historicalSold: soldMatch ? num(soldMatch[1]) : null,
      likedCount: favMatch ? num(favMatch[1]) : null,
      inStock,
      starBreakdown: gotStars ? stars : null
    };
  }

  global.RMDetailScrape = { scrapeDetail, idsFromUrl, isProductPage };
})(typeof window !== "undefined" ? window : this);
