/* ai.js — caption + tag generation via DeepSeek. Only fires on explicit user
 * click, only when a key is configured. No auto-calls, no other systems. */
(function (global) {
  "use strict";

  // Default Veo/Gemini phone-video prompt template, baked with Fikri's locked
  // presenter preferences (adult hijab woman, natural not lebay, outdoor daylight,
  // casual Indonesian, 9:16 vertical, ends "link di bio"). {{context}} is filled
  // with the scraped product knowledge; the model returns the finished prompt.
  const DEFAULT_VIDEO_PROMPT =
    "Kamu penulis prompt video Veo/Gemini untuk iklan Shopee affiliate. " +
    "Buatkan SATU prompt video sinematik siap-tempel ke Google Flow/Veo, format " +
    "9:16 vertikal (HP), durasi 8 detik, dari data produk ini:\n{{context}}\n\n" +
    "{{CONCEPT}}" +
    "=== PRIORITAS TERTINGGI: 3 DETIK PERTAMA ===\n" +
    "3 detik pertama menentukan hidup-mati video ini. Rancang khusus dan jelaskan " +
    "DETIK-PER-DETIK (0.0-1.0s, 1.0-2.0s, 2.0-3.0s). Wajib penuhi:\n" +
    "- FRAME PERTAMA sudah ada gerakan/ekspresi + produk terlihat. JANGAN mulai dari " +
    "frame kosong, logo, teks pembuka, atau presenter yang belum melakukan apa pun.\n" +
    "- Buka dengan hook verbal SINGKAT (maks 5-6 kata, langsung ke inti/rasa penasaran) " +
    "ATAU hook visual kuat — boleh manfaatkan RATING kalau angkanya mengesankan " +
    "(JANGAN sebut jumlah terjual atau jumlah review) " +
    "kalau angkanya memang mengesankan.\n" +
    "- Ada momen visual PUNCAK sebelum detik ke-3, bukan ditahan sampai akhir.\n" +
    "- Gerakan kamera di 3 detik pertama harus dinamis (push-in cepat / whip pan / reveal).\n" +
    "Tulis bagian ini paling detail dibanding bagian lain.\n\n" +
    "=== PRESENTER: KAMU YANG PUTUSKAN ===\n" +
    "Pilih presenter yang PALING COCOK dengan target pasar produk ini, jangan " +
    "pakai pola yang sama untuk semua produk. Pertimbangkan:\n" +
    "- Produk khusus pria (grooming pria, dompet pria, parfum pria, alat/otomotif) " +
    "→ presenter pria.\n" +
    "- Produk fashion muslim / mukena / hijab / busana syar'i → perempuan berhijab.\n" +
    "- Produk perempuan umum (skincare, fashion, aksesoris) → perempuan; berhijab " +
    "atau tidak, PILIH yang paling pas dengan gaya produknya.\n" +
    "- Produk anak/bayi → orang tua muda (ibu atau ayah) sesuai konteks.\n" +
    "- Produk netral (rumah tangga, gadget, alat tulis) → siapa pun yang natural, " +
    "boleh pria atau perempuan.\n" +
    "Sebutkan pilihanmu secara eksplisit di prompt (jenis kelamin, usia, penampilan). " +
    "WAJIB: presenter DEWASA (minimal ~20 tahun), penampilan sopan dan wajar.\n\n" +
    "{{SIZE_RULES}}" +
    "Aturan wajib lainnya: gaya main NATURAL & santai (jangan lebay/over-acting), " +
    "nada ngobrol ringan seperti teman. Setting OUTDOOR (taman/halaman/teras) siang " +
    "hari cahaya alami. Dialog bahasa Indonesia kasual. Alur 3-8s: perlihatkan produk " +
    "& manfaatnya, akhiri dengan ajakan 'link di bio'. " +
    "Sertakan: subject, action per detik, scene, camera movement, lens, lighting, mood, " +
    "dan audio/voice. Produk asli " +
    "akan di-drag user sebagai gambar referensi (Ingredients to Video), jadi JANGAN " +
    "deskripsikan detail bentuk produk secara spesifik — cukup rujuk 'produk ini'. " +
    "SEBUT NAMA PRODUK secara jelas dalam dialog dan/atau on-screen text — jangan ragu " +
    "menyebut nama/brand-nya. Kalau memakai bukti sosial, CUKUP RATING saja; " +
    "JANGAN sebut jumlah terjual/sudah laku berapa, jumlah review, persentase bintang, " +
    "atau jumlah favorit. " +
    "PENTING: prompt harus BERUPA PERINTAH langsung ke AI video. Awali dengan kalimat " +
    "perintah eksplisit, contoh: \"Buatkan video vertikal 9:16 berdurasi 8 detik dengan " +
    "spesifikasi berikut:\" — sehingga bisa langsung ditempel ke Gemini/Veo dan dieksekusi, " +
    "bukan sekadar deskripsi. " +
    "Keluarkan HANYA teks prompt-nya, tanpa penjelasan tambahan.";

  // --- product category detection (drives which video prompt is used) ---
  // HANDS-ONLY mode applies to anything small enough to demo IN HAND: phone
  // gear AND everyday handheld items (tumbler, mug, wallet, parfum, fidget…).
  // Bigger/worn products (dress, tas, sepatu, furniture) keep the presenter format.
  const PHONE_ACC = [
    "case", "casing", "kesing", "softcase", "hardcase", "silikon", "sarung hp",
    "tempered", "anti gores", "screen protector", "pelindung layar",
    "iphone", "samsung", "oppo", "vivo", "xiaomi", "redmi", "realme", "infinix",
    "poco", "handphone", "\\bhp\\b", "\\btws\\b", "earphone", "headset", "airpod",
    "powerbank", "power bank", "charger", "kabel data", "kabel charger",
    "holder", "popsocket", "ring stand", "lanyard", "tongsis", "tripod",
    "selfie stick", "stand hp", "gimbal", "otg", "adaptor"
  ];
  // Small handheld everyday objects — same hands-only + beat treatment.
  const HANDHELD_MISC = [
    "tumbler", "tumblr", "botol", "bottle", "mug", "gelas", "cangkir", "termos",
    "dompet", "wallet", "pouch", "jam tangan", "smartwatch", "kacamata",
    "sunglasses", "parfum", "perfume", "body mist", "lipstik", "lipstick",
    "lip tint", "serum", "skincare", "toner", "sunscreen", "hand cream",
    "gantungan", "keychain", "korek", "lighter", "pulpen", "pen\\b", "pensil",
    "stationery", "alat tulis", "sisir", "comb", "kuas", "brush", "spons",
    "squishy", "fidget", "pop it", "popit", "mainan kecil", "kartu", "tcg",
    "kipas mini", "mini fan", "speaker mini", "mouse", "flashdisk", "usb",
    "gunting", "pisau lipat", "obeng", "tang", "senter", "flashlight",
    "sikat", "pembersih", "spray", "diffuser", "lilin", "candle", "masker wajah",
    "sabun", "shampoo", "deodorant", "cukur", "razor", "nail", "kutek"
  ];
  const HANDHELD_RE = new RegExp(PHONE_ACC.concat(HANDHELD_MISC).join("|"), "i");

  // BIG items — need a BODY in frame so the viewer can judge scale, or are worn
  // and only make sense on a person. These always get the presenter format.
  const BIG_ITEMS = [
    // furniture & home
    "lemari", "rak\\b", "meja", "kursi", "sofa", "kasur", "springbed", "spring bed",
    "matras", "bantal", "guling", "sprei", "selimut", "karpet", "tirai", "gorden",
    "cermin besar", "standing", "kabinet", "buffet", "nakas", "dipan",
    // appliances
    "kulkas", "mesin cuci", "dispenser", "kipas angin", "air cooler", "ac\\b",
    "oven", "kompor", "microwave", "rice cooker", "blender", "vacuum",
    "water heater", "pemanas air", "setrika", "tv\\b", "televisi", "monitor",
    "printer", "sepeda", "sepeda listrik", "scooter", "stroller", "car seat",
    // worn / needs a body
    "gamis", "dress", "gaun", "kemeja", "kaos", "tshirt", "t-shirt", "blouse",
    "atasan", "bawahan", "rok\\b", "celana", "jeans", "jaket", "hoodie",
    "sweater", "cardigan", "blazer", "mukena", "hijab", "jilbab", "khimar",
    "abaya", "koko", "sarung\\b", "piyama", "daster", "seragam", "setelan",
    "tas\\b", "backpack", "ransel", "koper", "luggage", "handbag", "totebag",
    "sepatu", "sandal", "sneakers", "heels", "boots", "sendal",
    "helm", "jas hujan", "raincoat", "sajadah", "tenda", "hammock"
  ];
  const BIG_RE = new RegExp(BIG_ITEMS.join("|"), "i");

  /* Decide framing from product SIZE (Fikri's rule, 2026-09-15):
   *   small  -> HANDS ONLY (no face, no body) — a hand conveys the scale fine
   *   large  -> BODY IN FRAME (presenter) — the viewer needs a person for scale,
   *             or the product is worn and only reads on a body
   *   unknown-> presenter template, but the prompt is told to JUDGE the size and
   *             frame accordingly, so an unlisted product still gets it right.
   * BIG wins over handheld on a tie: "tas selempang HP" is a bag, not a phone bit.
   */
  function productSize(name) {
    const n = String(name || "");
    if (BIG_RE.test(n)) return "large";
    if (HANDHELD_RE.test(n)) return "small";
    return "unknown";
  }

  function isPhoneAccessory(name) {   // kept for backwards compatibility
    return productSize(name) === "small";
  }
  function isHandheld(name) {
    // BIG items are excluded even if they match a handheld keyword, so
    // "tas selempang HP" or "sarung bantal" is never treated as hands-only.
    return productSize(name) === "small";
  }

  // Framing rules by SIZE, injected into the presenter template.
  // LARGE = the viewer needs a person in frame to judge scale, or the product is
  // worn and only reads on a body.
  const SIZE_RULES_LARGE =
    "=== FRAMING — PRODUK BERUKURAN BESAR ===\n" +
    "Produk ini TIDAK cukup ditunjukkan dengan tangan saja. WAJIB tampilkan " +
    "PRESENTER dengan TUBUH terlihat (minimal setengah badan; full body kalau " +
    "produknya dipakai atau setinggi badan) supaya penonton bisa menilai UKURAN " +
    "sebenarnya. Sertakan minimal satu shot yang memperlihatkan produk " +
    "berdampingan dengan tubuh/orang sebagai pembanding skala. Kalau produk " +
    "dipakai (pakaian, tas, sepatu, helm), tunjukkan saat DIPAKAI, bukan hanya " +
    "dipegang.\n\n";

  // UNKNOWN = not in either list. Let the model judge from the product name, but
  // give it the exact rule so the outcome is still consistent.
  const SIZE_RULES_JUDGE =
    "=== FRAMING — NILAI SENDIRI UKURAN PRODUKNYA ===\n" +
    "Tentukan sendiri dari nama produk: apakah barang ini CUKUP KECIL untuk " +
    "digenggam satu tangan, atau BESAR sehingga butuh tubuh sebagai pembanding?\n" +
    "- KECIL (muat di tangan) → cukup TANGAN + produk saja, JANGAN tampilkan " +
    "wajah atau tubuh. Tabletop / POV dari atas, macro.\n" +
    "- BESAR (tidak muat di tangan, atau dipakai di badan) → tampilkan PRESENTER " +
    "dengan TUBUH terlihat supaya skalanya jelas; kalau dipakai, tunjukkan saat " +
    "dipakai.\n" +
    "Sebutkan keputusanmu di awal prompt (\"framing: hands-only\" atau " +
    "\"framing: presenter setengah/full body\") lalu konsisten sepanjang video.\n\n";

  // PHONE-CASE specific rules. Two corrections from Fikri's real Veo output:
  //  1. Case products always use FEMALE hands, manicured — that is the audience.
  //  2. NEVER flip the phone front-to-back. When told to flip, the AI renders a
  //     case on BOTH sides (nonsense). A gentle shake/tilt shows the case just as
  //     well and never produces that artifact.
  const CASE_RULES =
    "- KHUSUS CASING HP — WAJIB, JANGAN DILANGGAR:\n" +
    "  * Gunakan TANGAN PEREMPUAN (bukan pria, bukan netral) — tangan perempuan " +
    "dewasa yang terawat: kulit bersih dan halus, kuku rapi TERPOLES KUTEK " +
    "(warna elegan yang serasi dengan produk), terlihat menarik dan aesthetic. " +
    "Sebutkan detail ini secara eksplisit di prompt.\n" +
    "  * JANGAN PERNAH membalik HP depan-belakang (no flipping, no turning the " +
    "phone over, jangan tunjukkan sisi depan lalu belakang). Membalik HP membuat AI " +
    "salah render — casing muncul di KEDUA sisi, hasilnya tidak masuk akal.\n" +
    "  * Sebagai gantinya: GOYANGKAN / miringkan HP pelan (gentle shake, subtle " +
    "tilt, sway kiri-kanan kecil) supaya cahaya bergerak di permukaan casing dan " +
    "tekstur/kilau/motifnya terlihat jelas. Boleh macro push-in dan orbit KECIL " +
    "(maksimum ~30 derajat — jangan sampai memperlihatkan sisi sebaliknya).\n" +
    "  * Tampilkan casing HANYA dari satu sisi (sisi belakang HP tempat motifnya " +
    "berada) sepanjang video.\n";

  // Phone-case detector: narrower than isHandheld, used only to inject CASE_RULES.
  function isPhoneCase(name) {
    return /\b(case|casing|kesing|cover|softcase|hardcase|skin)\b/i
      .test(String(name || ""));
  }

  // HANDS-ONLY prompt: no face, product-in-hand demo, cut to a beat.
  const HANDS_VIDEO_PROMPT =
    "Kamu penulis prompt video Veo/Gemini untuk iklan Shopee affiliate produk yang " +
    "bisa dipegang tangan. Buatkan SATU prompt video siap-tempel ke Google Flow/Veo, " +
    "format 9:16 VERTIKAL (HP), durasi 8 detik, dari data produk ini:\n{{context}}\n\n" +
    "{{CONCEPT}}" +
    "=== PRIORITAS TERTINGGI: 3 DETIK PERTAMA ===\n" +
    "3 detik pertama menentukan hidup-mati video ini. Rancang khusus dan jelaskan " +
    "DETIK-PER-DETIK (0.0-1.0s, 1.0-2.0s, 2.0-3.0s). Wajib penuhi:\n" +
    "- FRAME PERTAMA sudah ada gerakan + produk, JANGAN mulai dari frame kosong, " +
    "logo, teks pembuka, atau tangan yang belum memegang apa pun.\n" +
    "- Pakai SATU pemicu scroll-stop yang jelas: reveal cepat, transformasi " +
    "sebelum→sesudah, gerakan memuaskan (snap/klik/tuang/putar), atau sudut " +
    "tak terduga yang bikin penonton bertanya 'apaan tuh?'.\n" +
    "- Ada momen visual PUNCAK sebelum detik ke-3 (bukan menunggu di akhir).\n" +
    "- Beat/aksen audio pertama jatuh tepat di gerakan hook itu.\n" +
    "- Tanpa narasi panjang di 3 detik pertama — biarkan visual yang bicara.\n" +
    "Tulis bagian ini paling detail dibanding bagian lain.\n\n" +
    "ATURAN WAJIB — HANDS-ONLY:\n" +
    "- HANYA TANGAN yang terlihat. TIDAK ADA wajah, tidak ada orang, tidak ada presenter, " +
    "tidak ada tubuh. Kamera menyorot tangan + produk saja (tabletop / POV dari atas).\n" +
    "- Tangan DEWASA, rapi dan bersih, gerakan halus dan percaya diri. Pilih tangan " +
    "yang cocok dengan target pasar produk: produk pria → tangan pria; produk " +
    "perempuan/beauty → tangan perempuan; produk netral → bebas, yang paling wajar. " +
    "Sebutkan pilihanmu secara eksplisit.\n" +
    "{{CASE_RULES}}" +
    "- Alur sisanya: 3-6s DEMO cepat (pakai/buka/tunjukkan tekstur & detail, " +
    "fungsi utamanya; putar 360 hanya jika produk BUKAN casing HP), " +
    "6-8s HERO SHOT produk + on-screen text 'Link di bio'.\n" +
    "- Editing MENGIKUTI BEAT: potongan cepat sinkron ke ketukan, 2-3 cut on beat, " +
    "gerakan produk tepat di beat drop.\n" +
    "- AUDIO: musik upbeat/trending beat instrumental (bukan voice-over, TANPA dialog), " +
    "plus SFX halus (snap, klik, swoosh, tuang). Sebutkan tempo ~120-130 BPM.\n" +
    "- Latar: meja bersih polos / permukaan estetik, pencahayaan lembut merata, " +
    "warna kontras agar produk menonjol. Shallow depth of field.\n" +
    "- Sertakan: subject (tangan+produk), action per detik, scene, camera movement " +
    "(macro push-in, top-down, orbit kecil), lens (35mm/50mm macro), lighting, mood, audio.\n" +
    "- Produk asli akan di-drag user sebagai gambar referensi (Ingredients to Video), " +
    "jadi JANGAN deskripsikan bentuk/warna produk secara spesifik — cukup rujuk 'produk ini'.\n" +
    "- SEBUT NAMA PRODUK secara jelas (di on-screen text dan/atau teks akhir). Jangan " +
    "ragu menyebut nama/brand-nya.\n" +
    "- Kalau memakai bukti sosial, CUKUP RATING saja. " +
    "JANGAN sebut jumlah terjual/sudah laku berapa, jumlah review, persentase bintang, " +
    "atau jumlah favorit.\n" +
    "PENTING: prompt harus BERUPA PERINTAH langsung ke AI video. Awali dengan kalimat " +
    "perintah eksplisit, contoh: \"Buatkan video vertikal 9:16 berdurasi 8 detik, " +
    "hands-only, dengan spesifikasi berikut:\" — sehingga bisa langsung ditempel ke " +
    "Gemini/Veo dan dieksekusi, bukan sekadar deskripsi.\n" +
    "Keluarkan HANYA teks prompt-nya, tanpa penjelasan tambahan.";

  function fill(tpl, product) {
    return tpl
      .replace(/{{name}}/g, product.name || "")
      .replace(/{{price}}/g, product.price != null ? "Rp" + product.price.toLocaleString("id-ID") : "");
  }

  async function call(cfg, prompt) {
    if (!cfg.ai || !cfg.ai.enabled) throw new Error("AI dimatikan di Admin Panel.");
    if (!cfg.ai.apiKey) throw new Error("DeepSeek API key belum diisi di Admin Panel.");
    const res = await fetch(cfg.ai.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + cfg.ai.apiKey
      },
      body: JSON.stringify({
        model: cfg.ai.model || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8
      })
    });
    if (!res.ok) throw new Error("DeepSeek error " + res.status);
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message.content || "").trim();
  }

  // Default caption template — ONE caption, ready to copy-paste. No variants:
  // choosing between three was friction, not value.
  const DEFAULT_CAPTION_PROMPT =
    "Kamu copywriter iklan Shopee affiliate Indonesia. Buatkan SATU caption " +
    "siap-posting (Facebook/Instagram/TikTok) dari data produk ini:\n{{context}}\n\n" +
    "{{CONCEPT}}" +
    "Aturan caption: bahasa Indonesia kasual-santai (nada bestie, jangan lebay/" +
    "hard-selling), hook kuat di kalimat PERTAMA, 2-4 baris saja, akhiri dengan ajakan " +
    "cek link. SEBUT NAMA PRODUK-nya — jangan ragu. Kalau memakai bukti sosial, CUKUP " +
    "RATING saja; JANGAN sebut jumlah terjual/sudah laku berapa, jumlah review, " +
    "persentase bintang, atau jumlah favorit.\n\n" +
    "HASHTAG — WAJIB ADA, taruh di baris terpisah setelah caption, 6-9 hashtag " +
    "(riset 2026: sedikit tapi bisa DICARI mengalahkan tumpukan tag). Struktur:\n" +
    "(a) 2 tag reach: #fyp #viral\n" +
    "(b) 2-4 tag NICHE yang benar-benar diketik pembeli (turunkan dari nama/kategori " +
    "produk dalam bahasa Indonesia — mis. #casinghp #rakdapur #lamputidur), " +
    "ini yang jadi SEO/temuan\n" +
    "(c) 2-3 tag niat-beli: #racunshopee #shopeefinds #checkoutdulu #tiktokmademebuyit\n" +
    "Huruf kecil, dipisah spasi, tanpa tanda baca lain.\n\n" +
    "FORMAT OUTPUT — persis seperti ini, tanpa judul/penjelasan/nomor variasi:\n" +
    "<isi caption 2-4 baris>\n\n<baris hashtag>\n\n" +
    "DILARANG: kalimat pembuka seperti 'Berikut caption...', markdown apa pun " +
    "(**bold**, ###, >, -, `), tanda kutip pembungkus, label 'Caption:'/'Hashtag:', " +
    "dan lebih dari satu caption. Keluarkan TEKS BIASA saja yang siap langsung " +
    "di-copy-paste ke kolom caption.";

  // Guaranteed hashtag block, used as a safety net if the model omits hashtags.
  const FYP_TAGS = "#fyp #viral";
  const SHOP_TAGS = "#shopeefinds #racunshopee #checkoutdulu";

  function slugTags(name) {
    // derive 2 product tags from the product name (first meaningful words)
    const words = String(name || "").toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length >= 4 && !/^(isi|pcs|box|set|untuk|dan|new|premium)$/.test(w));
    return words.slice(0, 2).map((w) => "#" + w).join(" ");
  }

  // Safety net for the single-caption output: strip stray variant labels, keep only
  // the FIRST caption (cut right after its hashtag line), and guarantee hashtags.
  function ensureHashtags(text, product) {
    let t = String(text || "")
      // drop a leading preamble line like "Berikut 3 variasi caption ... :"
      .replace(/^\s*(berikut|ini(?:lah)?)\b[^\n]*:\s*\n+/i, "")
      // drop variant labels / headings / separators
      .replace(/^-{2,}\s*VARIASI[^\n]*-{2,}\s*/gim, "")
      .replace(/^\s*\*{0,2}caption\s*\d*[^\n]*\*{0,2}\s*$/gim, "")
      .replace(/^\s*#{1,6}\s+[^\n]*$/gm, "")
      .replace(/^\s*-{3,}\s*$/gm, "")
      // strip markdown noise that breaks copy-paste
      .replace(/\*\*/g, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\s*(caption|hashtag)\s*:\s*/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // A "hashtag line" is a line that is mostly hashtags. Everything after the
    // first one belongs to a second variant the model shouldn't have produced.
    const lines = t.split("\n");
    const isTagLine = (l) => {
      const toks = l.trim().split(/\s+/).filter(Boolean);
      return toks.length >= 3 && toks.filter((w) => w.startsWith("#")).length >= toks.length - 1;
    };
    const firstTagIdx = lines.findIndex(isTagLine);
    if (firstTagIdx !== -1) {
      t = lines.slice(0, firstTagIdx + 1).join("\n").trim();
    }

    const tagCount = (t.match(/#\w+/g) || []).length;
    if (tagCount >= 6) return t;
    const block = [slugTags(product.name), FYP_TAGS, SHOP_TAGS]
      .filter(Boolean).join(" ");
    return t.replace(/\s*$/, "") + "\n\n" + block;
  }

  // Build the CONCEPT directive injected into video/caption prompts. Forces THIS
  // video to a specific concept archetype + its own visual set, so consecutive
  // videos for a product never look alike (Andromeda diversity + TikTok
  // anti-mass-production, research 2026-09-16). `c` is a RMConcepts concept.
  function conceptBlock(c, forVideo) {
    if (!c) return "";
    let s = "=== KONSEP VIDEO INI: " + c.label.toUpperCase() + " ===\n" +
      "Bangun SELURUH video/caption di sekitar SATU konsep ini, jangan campur: " +
      c.angle + ".\n" +
      "Hook pembuka pakai gaya: " + c.hook + ".\n";
    if (forVideo) {
      s += "Visual/kamera khas konsep ini: " + c.set + ".\n" +
        "WAJIB VARIASI: konsep, sudut kamera, latar, dan pencahayaan HARUS beda " +
        "dari video produk sebelumnya — JANGAN pakai template yang sama berulang " +
        "(algoritma menghukum video yang mirip-mirip).\n";
    }
    s += "\n";
    return s;
  }

  // Resolve the concept for a product: rotate via RMConcepts so a tag never
  // repeats until the library cycles. Falls back to a random pick if the module
  // or storage is unavailable.
  async function pickConcept(product, cfg) {
    const tag = (product && (product.suggestedTag || product.name)) || "global";
    let concept = null;
    try {
      // If the win-rate loop has a confident winner (from imported perf snapshot),
      // bias ~60% of picks toward it; otherwise rotate freely. Never 100% — we
      // still want variety so the mass-production penalty stays avoided AND we
      // keep gathering signal on other concepts.
      const snap = cfg && cfg.__perf;
      if (snap && global.RMConceptPerf && Math.random() < 0.6) {
        const bestId = await global.RMConceptPerf.bestConcept(snap);
        if (bestId && global.RMConcepts && global.RMConcepts.byId) {
          concept = global.RMConcepts.byId(bestId);
        }
      }
      if (!concept && global.RMConcepts && global.RMConcepts.next) {
        concept = await global.RMConcepts.next(tag);
      }
    } catch (_) {}
    if (!concept) concept = (global.RMConcepts && global.RMConcepts.pick) ? global.RMConcepts.pick() : null;
    // record it for the win-rate loop
    try {
      if (concept && global.RMConceptPerf) await global.RMConceptPerf.log(tag, concept.id);
    } catch (_) {}
    return concept;
  }

  async function generateCaption(cfg, product) {
    const ctx = productContext(product);
    // if the user customised captionPrompt in Admin Panel, honour it (with {{context}}
    // support); otherwise use the richer default.
    const tpl = (cfg.ai && cfg.ai.captionPrompt && /{{context}}/.test(cfg.ai.captionPrompt))
      ? cfg.ai.captionPrompt
      : (cfg.ai && cfg.ai.captionPrompt && cfg.ai.captionPrompt.trim() &&
         !/{{context}}/.test(cfg.ai.captionPrompt)
          ? cfg.ai.captionPrompt + "\n\nData produk: {{context}}"
          : DEFAULT_CAPTION_PROMPT);
    const concept = await pickConcept(product, cfg);
    const raw = await call(cfg, tpl.replace(/{{context}}/g, ctx)
      .replace(/{{CONCEPT}}/g, conceptBlock(concept, false))
      .replace(/{{name}}/g, product.name || "")
      .replace(/{{price}}/g, product.price != null ? "Rp" + product.price.toLocaleString("id-ID") : ""));
    return ensureHashtags(raw, product);
  }
  async function generateTag(cfg, product) {
    const raw = await call(cfg, fill(cfg.ai.tagPrompt, product));
    return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  }

  // Lean context. Fikri's rule (updated 2026-09-13): social proof = RATING ONLY.
  // Jumlah terjual is deliberately NOT passed to the AI so it can never leak into
  // a caption or video prompt. No review counts, no star percentages either.
  function productContext(p) {
    const parts = [];
    if (p.name) parts.push("Nama produk (SEBUT dalam video/caption): " + p.name);
    if (p.price != null) parts.push("Harga: Rp" + p.price.toLocaleString("id-ID"));
    if (p.commissionPct != null || (p.economics && p.economics.commissionPct))
      parts.push("Komisi: " + (p.commissionPct || p.economics.commissionPct) + "%");
    if (p.rating != null) parts.push("Rating: " + p.rating + "/5");
    return parts.join(" | ");
  }

  // Generate a Veo/Gemini PHONE (9:16) video prompt from product knowledge.
  // Auto-selects the template: phone/case/accessory -> HANDS-ONLY + beat music,
  // everything else -> the hijab presenter format.
  async function generateVideoPrompt(cfg, product) {
    const ctx = productContext(product);
    // Size decides the framing: small -> hands only, large -> body in frame,
    // unknown -> presenter template that is told to judge the size itself.
    const size = productSize(product.name);
    const handsMode = size === "small";
    // a user-customised videoPrompt in Admin Panel always wins
    const custom = cfg.ai && cfg.ai.videoPrompt && cfg.ai.videoPrompt.trim();
    const tpl = custom || (handsMode ? HANDS_VIDEO_PROMPT : DEFAULT_VIDEO_PROMPT);
    const sizeBlock = handsMode ? ""
      : (size === "large" ? SIZE_RULES_LARGE : SIZE_RULES_JUDGE);
    // Phone cases get extra hard rules (female manicured hands; never flip the
    // phone — shake/tilt instead, because flipping makes the AI render a case on
    // both sides). Any other product drops the placeholder entirely.
    const caseBlock = isPhoneCase(product.name) ? CASE_RULES : "";
    const concept = await pickConcept(product, cfg);
    product.__concept = concept ? concept.id : null;   // for UI labelling / logging
    const instruction = tpl
      .replace(/{{SIZE_RULES}}/g, sizeBlock)
      .replace(/{{CASE_RULES}}/g, caseBlock)
      .replace(/{{CONCEPT}}/g, conceptBlock(concept, true))
      .replace(/{{context}}/g, ctx)
      .replace(/{{name}}/g, product.name || "");
    // NOTE: no mode label is prefixed — the whole textarea gets pasted into
    // Gemini/Veo, so any bracketed note would become noise in the prompt.
    // The mode is surfaced in the panel's section title instead (see content.js).
    return call(cfg, instruction);
  }

  // Which video template a product will use — for labelling in the UI.
  function videoMode(cfg, product) {
    if (cfg && cfg.ai && cfg.ai.videoPrompt && cfg.ai.videoPrompt.trim())
      return "template custom (Admin Panel)";
    if (isPhoneCase(product.name))
      return "HANDS-ONLY + beat · CASING (tangan perempuan berkutek, HP digoyang bukan dibolak-balik)";
    const size = productSize(product.name);
    if (size === "small") return "HANDS-ONLY + beat (barang kecil, cukup tangan)";
    if (size === "large") return "PRESENTER + TUBUH terlihat (barang besar, butuh skala)";
    return "PRESENTER — AI menilai sendiri ukurannya (kecil→tangan, besar→tubuh)";
  }

  global.RMAi = { generateCaption, generateTag, generateVideoPrompt, productContext,
                  isPhoneAccessory, isHandheld, isPhoneCase, productSize, videoMode };
})(typeof window !== "undefined" ? window : this);
