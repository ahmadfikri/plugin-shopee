/* enrich.js — deepen each product with FREE public Shopee data.
 *
 * The affiliate card gives price/sold/commission. Shopee also exposes an item
 * detail JSON at get_pc?itemid=..&shopid=.. (public, no key) that adds:
 *   rating star, review count, historical sold, stock, shop rating, ctime (age).
 * We call it politely (throttled, only for visible cards) from the content
 * script's page context, so it rides the user's own session/cookies.
 *
 * Everything is best-effort: any failure leaves the product as-is (fields null),
 * and the pro-score treats unknown fields as neutral, never inventing data. */
(function (global) {
  "use strict";

  function idsFrom(product) {
    // affiliate link form: /offer/product_offer/<itemid> OR marketplace i.<shop>.<item>
    const h = product.href || "";
    let m = h.match(/i\.(\d+)\.(\d+)/);
    if (m) return { shopid: m[1], itemid: m[2] };
    m = h.match(/product_offer\/(\d+)/);
    if (m) return { shopid: null, itemid: m[1] }; // shopid unknown; API can still resolve some
    if (typeof product.id === "string" && product.id.includes(".")) {
      const [a, b] = product.id.split(".");
      return { shopid: a, itemid: b };
    }
    return { shopid: null, itemid: product.id };
  }

  async function fetchOne(product) {
    // DISABLED: calling item/get from the affiliate subdomain trips Shopee's
    // anti-bot CAPTCHA (scene=crawler_item) and can flag the user's session.
    // We do NOT auto-fetch. Rating/age come only if a future SAME-ORIGIN,
    // human-triggered path provides them. Return the product unchanged.
    return product;
  }

  // No API implementation is retained here: detail data must come from the DOM
  // of a product page the user opened themselves.

  // Throttled enrichment of the first N products (visible batch), so we don't
  // hammer Shopee. Returns a new products array.
  async function enrich(products, opts) {
    const limit = (opts && opts.limit) || 20;
    const delayMs = (opts && opts.delayMs) || 250;
    const out = products.slice();
    for (let i = 0; i < Math.min(limit, out.length); i++) {
      out[i] = await fetchOne(out[i]);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return out;
  }

  // Deep analysis for the drill-down modal.
  // NOTE: directly fetching item/get or navigating to the product page trips
  // Shopee's anti-bot CAPTCHA (scene=crawler_item) and/or CORS from the affiliate
  // subdomain. So the modal is built from data ALREADY scraped/enriched on the
  // listing page — no extra request. The user opens the real product page
  // manually via the "Buka di Shopee" link (a human click is not flagged).
  async function fetchDetail(product) {
    // If a prior enrich() pass already attached rating/age (same-origin item/get
    // succeeded on the marketplace domain), surface it; otherwise return what we
    // have from the card without making a flagged request.
    return {
      error: null,
      fromCardOnly: (product.rating == null && product.reviewCount == null),
      name: product.name,
      price: product.price,
      rating: product.rating != null ? product.rating : null,
      totalReviews: product.reviewCount != null ? product.reviewCount : null,
      starBreakdown: product.starBreakdown || null,
      historicalSold: product.soldTotal,
      stock: product.stock != null ? product.stock : null,
      likedCount: product.likedCount != null ? product.likedCount : null,
      ageMonths: product.ageMonths != null ? product.ageMonths : null,
      isOfficial: !!product.isOfficial
    };
  }

  global.RMEnrich = { enrich, fetchOne, fetchDetail, idsFrom };
})(typeof window !== "undefined" ? window : this);
