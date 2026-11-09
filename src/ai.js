/* ai.js — caption + tag generation via DeepSeek. Only fires on explicit user
 * click, only when a key is configured. No auto-calls, no other systems. */
(function (global) {
  "use strict";

  // Default Veo/Gemini phone-video prompt template, baked with Fikri's locked
  // presenter preferences (adult hijab woman, natural not lebay, outdoor daylight,
  // casual Indonesian, 9:16 vertical, ends "link di bio"). {{context}} is filled
  // with the scraped product knowledge; the model returns the finished prompt.
  // Fikri's rule (2026-10-09): rating is NEVER mentioned — not in captions, not
  // in video prompts, not as a hook, not as on-screen text. One constant feeds
  // every prompt template and productContext(); stripRating() enforces it on
  // the OUTPUT so a stale stored prompt or an ignoring model still can't leak it.
  const RATING_BAN =
    "JANGAN sebut, tulis, atau singgung RATING dalam bentuk apa pun — tidak ada angka rating " +
    "apa pun, bintang atau emoji bintang, 'rating tinggi', jumlah review/ulasan, " +
    "persentase bintang, jumlah terjual/sudah laku berapa, atau jumlah favorit. " +
    "Angkat sisi lain: fungsi produk, masalah yang dipecahkan, tampilan, momen pemakaian.";

  const DEFAULT_VIDEO_PROMPT =
    "Kamu penulis prompt video Veo/Gemini untuk iklan Shopee affiliate. " +
    "Buatkan SATU prompt video sinematik siap-tempel ke Google Flow/Veo, format " +
    "9:16 vertikal (HP), durasi 10 detik, dari data produk ini:\n{{context}}\n\n" +
    "{{CONCEPT}}" +
    "{{GEMINI_RULES}}" +
    "=== PRIORITAS TERTINGGI: 3 DETIK PERTAMA ===\n" +
    "3 detik pertama menentukan hidup-mati video ini. Rancang khusus dan jelaskan " +
    "DETIK-PER-DETIK (0.0-1.0s, 1.0-2.0s, 2.0-3.0s). Wajib penuhi:\n" +
    "- FRAME PERTAMA sudah ada gerakan/ekspresi + produk terlihat. JANGAN mulai dari " +
    "frame kosong, logo, teks pembuka, atau presenter yang belum melakukan apa pun.\n" +
    "- Buka dengan hook verbal SINGKAT (maks 5-6 kata, langsung ke inti/rasa penasaran) " +
    "ATAU hook visual kuat (fungsi produk, masalah yang dipecahkan, momen reveal). " +
    "JANGAN pakai rating, bintang, jumlah terjual, atau jumlah review sebagai hook.\n" +
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
    "hari cahaya alami. Dialog bahasa Indonesia kasual. Alur 3-10s: perlihatkan produk " +
    "& manfaatnya, akhiri dengan ajakan 'link di bio'. " +
    "Sertakan: subject, action per detik, scene, camera movement, lens, lighting, mood, " +
    "dan audio/voice. Produk asli " +
    "akan di-drag user sebagai gambar referensi (Ingredients to Video), jadi JANGAN " +
    "deskripsikan detail bentuk produk secara spesifik — cukup rujuk 'produk ini'. " +
    "LARANGAN HARGA: JANGAN sebut, tulis, atau singgung HARGA dalam bentuk apa pun — tidak ada angka Rp, diskon, potongan, promo, persentase hemat, 'murah', 'terjangkau', 'harga miring', atau perbandingan harga. " +
    "SEBUT NAMA PRODUK secara jelas dalam dialog dan/atau on-screen text — jangan ragu " +
    "menyebut nama/brand-nya. " +
    "LARANGAN RATING: " + RATING_BAN + " " +
    "PENTING: prompt harus BERUPA PERINTAH langsung ke AI video. Awali dengan kalimat " +
    "perintah eksplisit, contoh: \"Buatkan video vertikal 9:16 berdurasi 10 detik dengan " +
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
  //     case on BOTH sides (nonsense). Just a gentle shake/sway of the phone —
  //     no before/after transformation, no tapping, no flipping (Fikri: those
  //     angles are useless; pure showcase shake is what he wants).

  // Gemini/Veo quality contract. Product identity and temporal continuity beat
  // fancy camera motion: an attractive shot is useless if the product morphs.
  const GEMINI_RULES =
    "=== GEMINI/VEO — FIDELITY & CONTINUITY CONTRACT ===\n" +
    "- Gambar referensi adalah SATU-SATUNYA sumber kebenaran produk. Pertahankan " +
    "siluet, warna, motif, material, logo, proporsi, dan posisi detail produk SAMA " +
    "di setiap frame; jangan mengarang varian atau dekorasi baru.\n" +
    "- Maksimal 3 shot dalam 10 detik. Setiap cut harus mempertahankan produk yang " +
    "sama secara temporal — tidak morphing, tidak berubah warna/bentuk/ukuran.\n" +
    "- Hanya SATU unit produk utama. Jangan menduplikasi produk, jangan membuat " +
    "objek menyatu/menembus tangan, dan jangan memunculkan tangan/jari tambahan.\n" +
    "- Anatomi tangan natural: lima jari per tangan, tidak menyatu, genggaman " +
    "masuk akal, kontak tangan-produk stabil.\n" +
    "- Utamakan controlled macro push-in, tilt kecil, atau rack focus. Hindari " +
    "gerakan kamera ekstrem yang membuat geometri produk rusak.\n" +
    "- Jangan menaruh tulisan pada permukaan fisik produk. On-screen text harus " +
    "overlay digital sederhana, kontras, singkat, dan tidak menutupi produk.\n" +
    "- Negative constraints wajib ditulis ulang di akhir prompt hasil agar Gemini " +
    "tidak mengabaikannya.\n\n";
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
    "  * Tampilkan casing HANYA dari satu sisi (sisi belakang HP tempat motifnya " +
    "berada) sepanjang video. Kunci kamera di rear hemisphere; jangan pernah " +
    "melewati sudut samping menuju layar depan. Gerakannya CUKUP goyang-goyangkan " +
    "HP pelan (gentle shake / sway kiri-kanan kecil) supaya cahaya bergerak di " +
    "permukaan casing dan tekstur/kilau/motifnya terlihat — tidak perlu aksi lain.\n" +
    "  * JANGAN pakai konsep sebelum→sesudah / transformasi apa pun. Ini murni " +
    "showcase casing yang digoyang pelan, bukan demo perubahan.\n" +
    "  * Hanya SATU HP dengan SATU casing yang sudah terpasang. Posisi lubang kamera, " +
    "bibir casing, tombol, motif, dan jumlah lensa harus identik dengan gambar " +
    "referensi di semua frame — jangan berubah, hilang, berlipat, atau berpindah.\n" +
    "  * Jari jangan menutup motif atau lubang kamera. Hindari cermin/refleksi kuat " +
    "yang terlihat seperti HP atau casing kedua.\n";

  // Phone-case detector: narrower than isHandheld, used only to inject CASE_RULES.
  function isPhoneCase(name) {
    return /\b(case|casing|kesing|cover|softcase|hardcase|skin)\b/i
      .test(String(name || ""));
  }

  // HANDS-ONLY prompt: no face, product-in-hand demo, cut to a beat.
  const HANDS_VIDEO_PROMPT =
    "Kamu penulis prompt video Veo/Gemini untuk iklan Shopee affiliate produk yang " +
    "bisa dipegang tangan. Buatkan SATU prompt video siap-tempel ke Google Flow/Veo, " +
    "format 9:16 VERTIKAL (HP), durasi 10 detik, dari data produk ini:\n{{context}}\n\n" +
    "{{CONCEPT}}" +
    "{{GEMINI_RULES}}" +
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
    "- Alur sisanya: 3-7s DEMO cepat (pakai/buka/tunjukkan tekstur & detail, " +
    "fungsi utamanya; putar 360 hanya jika produk BUKAN casing HP), " +
    "7-10s HERO SHOT produk + on-screen text 'Link di bio'.\n" +
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
    "- LARANGAN HARGA: JANGAN sebut, tulis, atau singgung HARGA dalam bentuk apa pun — tidak ada angka Rp, diskon, potongan, promo, persentase hemat, 'murah', 'terjangkau', 'harga miring', atau perbandingan harga.\n" +
    "- SEBUT NAMA PRODUK secara jelas (di on-screen text dan/atau teks akhir). Jangan " +
    "ragu menyebut nama/brand-nya.\n" +
    "- LARANGAN RATING: " + RATING_BAN + "\n" +
    "PENTING: prompt harus BERUPA PERINTAH langsung ke AI video. Awali dengan kalimat " +
    "perintah eksplisit, contoh: \"Buatkan video vertikal 9:16 berdurasi 10 detik, " +
    "hands-only, dengan spesifikasi berikut:\" — sehingga bisa langsung ditempel ke " +
    "Gemini/Veo dan dieksekusi, bukan sekadar deskripsi.\n" +
    "Keluarkan HANYA teks prompt-nya, tanpa penjelasan tambahan.";

  function fill(tpl, product) {
    return tpl
      .replace(/{{name}}/g, product.name || "")
      .replace(/{{price}}/g, "");
  }

  async function call(cfg, prompt, temperature) {
    if (!cfg.ai || !cfg.ai.enabled) throw new Error("AI dimatikan di Admin Panel.");
    if (!cfg.ai.apiKey) throw new Error("DeepSeek API key belum diisi di Admin Panel.");
    // Auto-retry transient failures (timeout / 429 / 5xx / network blip) so the
    // user doesn't have to click "Caption" several times. 3 attempts, backoff.
    const MAX = 3;
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX; attempt++) {
      // guard: test sandboxes (node vm) have no AbortController; Chrome always does
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl && typeof setTimeout === "function" ? setTimeout(() => ctrl.abort(), 45000) : 0; // 45s per attempt
      const clearTimeout = (t) => { if (t && typeof globalThis.clearTimeout === "function") globalThis.clearTimeout(t); };
      try {
        const res = await fetch(cfg.ai.baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + cfg.ai.apiKey
          },
          body: JSON.stringify({
            model: cfg.ai.model || "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            temperature: temperature == null ? 0.8 : temperature
          }),
          signal: ctrl ? ctrl.signal : undefined
        });
        clearTimeout(timer);
        if (!res.ok) {
          // 429 / 5xx are transient -> retry; 4xx (auth/bad request) -> fail fast
          const body = await res.text().catch(() => "");
          if (res.status === 429 || res.status >= 500) {
            lastErr = new Error("DeepSeek " + res.status + " (sibuk/limit)" + (body ? ": " + body.slice(0, 120) : ""));
            if (attempt < MAX) { await sleep(800 * attempt); continue; }
            throw lastErr;
          }
          throw new Error("DeepSeek error " + res.status + (body ? ": " + body.slice(0, 160) : ""));
        }
        const data = await res.json();
        const out = (data.choices && data.choices[0] && data.choices[0].message.content || "").trim();
        if (!out) {
          lastErr = new Error("DeepSeek balas kosong");
          if (attempt < MAX) { await sleep(800 * attempt); continue; }
          throw lastErr;
        }
        return out;
      } catch (err) {
        clearTimeout(timer);
        const transient = err.name === "AbortError" || /network|fetch|timeout|kosong|sibuk|limit/i.test(err.message || "");
        lastErr = err.name === "AbortError" ? new Error("DeepSeek timeout (>45s)") : err;
        if (transient && attempt < MAX) { await sleep(800 * attempt); continue; }
        throw lastErr;
      }
    }
    throw lastErr || new Error("DeepSeek gagal");
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Per-NICHE Indonesian hashtags (replaces the expired 10.10 campaign tags,
  // Fikri 2026-10-11). The 10.10 BrandsFestival / ShopeeMall campaign is OVER;
  // forcing a dead campaign tag into every caption only wastes a hashtag slot.
  // Instead each caption now carries 2-3 tags for the product's OWN niche —
  // terms Indonesian buyers actually type into search, so they do SEO work.
  // Each niche: [classifier regex, [tags...]]. First match wins; order matters
  // (specific before generic). `generic` is the fallback when nothing matches.
  // These are derived from the real product-category keyword lists above, i.e.
  // the words buyers use — not invented "trending" tags.
  const NICHE_TAGS = [
    [/\b(case|casing|kesing|softcase|hardcase|silikon|sarung hp)\b/i, ["#casinghp", "#casehp", "#aksesorishp"]],
    [/\b(tempered|anti gores|screen protector|pelindung layar)\b/i, ["#antigores", "#temperedglass", "#pelindunglayar"]],
    [/\b(tws|earphone|headset|airpod|earbud|headphone)\b/i, ["#twsmurah", "#earphone", "#headsetbluetooth"]],
    [/\b(powerbank|power bank|charger|kabel data|kabel charger|adaptor)\b/i, ["#powerbank", "#chargerhp", "#aksesorishp"]],
    [/\b(holder|popsocket|ring stand|tongsis|tripod|gimbal|stand hp)\b/i, ["#holderhp", "#aksesorishp", "#gadgetmurah"]],
    [/\b(tumbler|tumblr|botol|bottle|mug|gelas|termos|cangkir)\b/i, ["#tumbler", "#botolminum", "#peralatanrumah"]],
    [/\b(dompet|wallet|pouch)\b/i, ["#dompet", "#dompetmurah", "#fashionpria"]],
    [/\b(jam tangan|smartwatch)\b/i, ["#jamtangan", "#smartwatch", "#jamtanganmurah"]],
    [/\b(parfum|perfume|body mist|skincare|serum|toner|sunscreen|lipstik|lipstick|lip tint)\b/i, ["#skincare", "#parfummurah", "#racunkecantikan"]],
    [/\b(kacamata|sunglasses)\b/i, ["#kacamata", "#sunglasses", "#kacamatafashion"]],
    [/\b(squishy|fidget|pop it|popit|mainan|tcg|kartu)\b/i, ["#mainanmurah", "#mainananak", "#koleksimainan"]],
    [/\b(mouse|keyboard|flashdisk|usb|otg|speaker mini)\b/i, ["#gadgetmurah", "#aksesoriskomputer", "#gadget"]],
    [/\b(lemari|rak\b|meja|kursi|sofa|kabinet|nakas|dipan|buffet)\b/i, ["#perabotrumah", "#furnituremurah", "#dekorasirumah"]],
    [/\b(kasur|springbed|matras|bantal|guling|sprei|selimut|karpet|tirai|gorden)\b/i, ["#peralatantidur", "#dekorasirumah", "#homeliving"]],
    [/\b(kulkas|mesin cuci|dispenser|kipas angin|air cooler|oven|kompor|microwave|rice cooker|blender|vacuum|setrika)\b/i, ["#alatrumahtangga", "#elektronikrumah", "#perkakasdapur"]],
    [/\b(gamis|mukena|hijab|jilbab|khimar|abaya|koko|sajadah)\b/i, ["#fashionmuslim", "#gamismurah", "#ootdhijab"]],
    [/\b(dress|gaun|kemeja|kaos|tshirt|t-shirt|blouse|atasan|rok\b|celana|jeans|jaket|hoodie|sweater|cardigan|daster|piyama)\b/i, ["#ootd", "#fashionmurah", "#outfitharian"]],
    [/\b(tas\b|backpack|ransel|koper|handbag|totebag|selempang)\b/i, ["#tasmurah", "#fashiontas", "#ootd"]],
    [/\b(sepatu|sandal|sneakers|heels|boots|sendal)\b/i, ["#sepatumurah", "#ootd", "#sepatuviral"]],
    [/\b(helm|jas hujan|raincoat)\b/i, ["#aksesorismotor", "#perlengkapanmotor", "#otomotif"]],
  ];
  const GENERIC_NICHE_TAGS = ["#shopeefinds", "#rekomendasibarang", "#belanjaonline"];
  function nicheTags(name) {
    const n = String(name || "");
    for (const [re, tags] of NICHE_TAGS) if (re.test(n)) return tags;
    return GENERIC_NICHE_TAGS;
  }

  // Default caption template — ONE caption, ready to copy-paste. No variants:
  // choosing between three was friction, not value.
  // Disclaimer line appended to EVERY caption (Fikri 2026-10-13): the videos are
  // AI-generated, so the real item can look slightly different. Enforced on the
  // output by ensureDisclaimer(), not just requested in the prompt.
  const CAPTION_DISCLAIMER = "Catatan: tampilan produk asli mungkin sedikit berbeda dari video.";

  // SEO-first caption (Fikri 2026-10-13: "caption fokus sekali lagi di SEO").
  // TikTok/IG/FB search index the caption TEXT, and the first line (before the
  // "more" fold) carries the most weight, so the prompt forces one buyer-typed
  // main keyword into the first sentence plus 2-3 natural long-tail variants.
  const DEFAULT_CAPTION_PROMPT =
    "Kamu copywriter iklan Shopee affiliate Indonesia yang paham SEO pencarian " +
    "TikTok/Instagram/Facebook. Buatkan SATU caption siap-posting dari data produk ini:\n" +
    "{{context}}\n\n" +
    "{{CONCEPT}}" +
    "PRIORITAS UTAMA = SEO: caption ini harus bisa DITEMUKAN lewat kolom pencarian " +
    "TikTok/IG/FB, karena platform membaca teks caption untuk pencarian.\n" +
    "1. Tentukan SATU kata kunci utama 2-4 kata yang paling mungkin DIKETIK pembeli " +
    "Indonesia untuk mencari produk ini — bahasa sehari-hari, BUKAN judul Shopee yang " +
    "panjang (contoh: 'casing iphone 15 polkadot', 'rak dapur susun', 'tumbler stainless'). " +
    "Jangan tulis label 'kata kunci'.\n" +
    "2. KALIMAT PERTAMA WAJIB memuat kata kunci utama itu persis, di 3-6 kata awal — " +
    "baris pertama adalah yang terlihat sebelum 'lainnya' dan paling berbobot untuk pencarian.\n" +
    "3. Di badan caption masukkan 2-3 variasi kata kunci turunan secara alami (long-tail: " +
    "jenis, bahan, fungsi, untuk siapa, tipe HP/ukuran kalau ada di nama — mis. " +
    "'case hp bening', 'casing anti kuning'). DILARANG keyword stuffing: tiap kalimat " +
    "tetap enak dibaca seperti orang cerita.\n" +
    "4. Sebut manfaat konkret pakai kata yang dicari orang ('anti gores', 'muat banyak', " +
    "'gampang dibersihkan'), bukan kata sifat kosong.\n\n" +
    // v0.9.33 (Fikri 2026-11-09): caption harus bikin orang like & share, tetap
    // SEO. Like/share didapat dari ISI yang relatable & berguna, BUKAN dari
    // minta like/share: Meta (FB/IG) menurunkan jangkauan dan skor kualitas
    // iklan untuk engagement bait (react/share/tag/comment/vote baiting), yang
    // ujungnya menaikkan CPC. stripEngagementBait() menjaga ini di output.
    "ENGAGEMENT — bikin orang PENGEN like, simpan, dan kirim ke temannya karena ISINYA, " +
    "bukan karena diminta:\n" +
    "5. Setelah kalimat kata kunci, tulis SATU momen relatable yang spesifik — situasi " +
    "sehari-hari yang bikin penonton mikir 'ini gue banget' atau langsung keinget " +
    "seseorang (mis. 'yang HP-nya sering jatuh dari kasur', 'yang dapurnya sempit tapi " +
    "barangnya banyak'). Momen ini yang bikin orang share sendiri.\n" +
    "6. Kasih satu hal yang BERGUNA atau bikin penasaran dari produk itu (tip pakai, " +
    "detail kecil yang jarang orang tahu, cara beda pakainya), supaya caption layak disimpan.\n" +
    "7. Tutup dengan SATU pertanyaan terbuka yang gampang dijawab dari pengalaman " +
    "penonton dan nyambung ke masalah tadi (mis. 'HP kamu paling sering jatuh di mana?'), " +
    "lalu ajakan cek link.\n" +
    "LARANGAN ENGAGEMENT BAIT (FB/IG menurunkan jangkauan): JANGAN minta like/love/react, " +
    "JANGAN minta share/bagikan/kirim ke teman, JANGAN minta tag teman, JANGAN minta komen " +
    "kata tertentu ('komen MAU', 'ketik 1'), JANGAN voting ('like kalau A, komen kalau B'). " +
    "Biarkan orang melakukannya sendiri karena isinya relatable.\n\n" +
    "Gaya: bahasa Indonesia santai dan WAJAR seperti orang biasa cerita, " +
    "JANGAN alay/lebay, JANGAN hard-selling, JANGAN pakai huruf kapital berlebihan " +
    "atau emoji bertumpuk. Hook di kalimat pertama boleh menarik tapi tetap masuk akal " +
    "— tanpa hiperbola (hindari 'GILA', 'auto sultan', 'terbaik sedunia', 'wajib punya " +
    "atau nyesel'). 4-6 baris saja (kata kunci, momen relatable, manfaat + hal berguna, " +
    "pertanyaan penutup), akhiri dengan ajakan cek link. " +
    "SEBUT NAMA PRODUK-nya — jangan ragu. " +
    "LARANGAN HARGA: JANGAN sebut, tulis, atau singgung HARGA dalam bentuk apa pun — tidak ada angka Rp, diskon, potongan, promo, persentase hemat, 'murah', 'terjangkau', 'harga miring', atau perbandingan harga. " +
    "LARANGAN RATING: " + RATING_BAN + "\n\n" +
    "HASHTAG — WAJIB ADA, taruh di baris terpisah setelah caption, 6-9 hashtag " +
    "organik (riset 2026: sedikit tapi bisa DICARI mengalahkan tumpukan tag). Struktur:\n" +
    "(a) 2-3 tag NICHE produk ini yang WAJIB ada, tulis PERSIS: {{NICHE_TAGS}}\n" +
    "(b) 2 tag reach: #fyp #viral\n" +
    "(c) 1-2 tag SEO dari kata kunci utama tadi, ditulis tanpa spasi (mis. " +
    "#casingiphone15 #rakdapursusun) — ini yang jadi temuan pencarian\n" +
    "(d) 2-3 tag niat-beli: #racunshopee #shopeefinds #checkoutdulu #tiktokmademebuyit\n" +
    "Semua hashtag huruf kecil, dipisah spasi, " +
    "tanpa tanda baca lain.\n\n" +
    "DISCLAIMER WAJIB: setelah ajakan cek link, tulis satu baris PERSIS ini: " +
    CAPTION_DISCLAIMER + "\n\n" +
    "FORMAT OUTPUT — persis seperti ini, tanpa judul/penjelasan/nomor variasi:\n" +
    "<isi caption 4-6 baris>\n" + CAPTION_DISCLAIMER + "\n\n<baris hashtag>\n\n" +
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

  // Niche tags are enforced on the finished caption no matter what the model
  // returned (or what stale stored prompt it ran on) — same non-negotiable
  // "enforce on output" pattern the campaign tags used before 10.10 ended.
  function ensureNicheTags(text, product) {
    let t = String(text || "");
    const want = nicheTags(product && product.name);
    const missing = want.filter(
      (tag) => !new RegExp("(^|\\s)" + tag + "\\b", "i").test(t)
    );
    if (!missing.length) return t;

    const lines = t.split("\n");
    const isTagLine = (l) => {
      const toks = l.trim().split(/\s+/).filter(Boolean);
      return toks.length >= 2 && toks.filter((w) => w.startsWith("#")).length >= toks.length - 1;
    };
    // append to the LAST hashtag line so the caption body stays untouched
    for (let i = lines.length - 1; i >= 0; i--) {
      if (isTagLine(lines[i])) {
        lines[i] = lines[i].replace(/\s*$/, "") + " " + missing.join(" ");
        return lines.join("\n");
      }
    }
    return t.replace(/\s*$/, "") + "\n\n" + missing.join(" ");
  }

  // Safety net for the single-caption output: strip stray variant labels, keep only
  // the FIRST caption (cut right after its hashtag line), and guarantee hashtags.
  // OUTPUT-side price guard (Fikri's rule 2026-10-02: no price anywhere).
  // The prompt already forbids price, but an LLM can still slip one in, so the
  // finished caption / video prompt is scrubbed too — same "non-negotiable,
  // enforce on output" pattern as ensureNicheTags.
  const PRICE_PATTERNS = [
    /\bRp\.?\s?\d[\d.,]*(\s?(rb|ribu|k|jt|juta))?\b/gi,           // Rp39.000, Rp 25rb
    /\b\d[\d.,]*\s?(rb|ribu)\s?(an|aja|saja)?\b/gi,                // 25rb, 30 ribuan
    /\b(diskon|potongan|hemat|cashback|off)\s*(s\.?d\.?\s*)?\d+\s?%/gi, // diskon 50%
    /\b\d+\s?%\s*(off|diskon)\b/gi,                                 // 50% off
    /#(harga\w*|murah\w*|diskon\w*|promo\w*|sale|flashsale|cuci\w*gudang)\b/gi,
    /\b(harga\s+(murah|miring|terjangkau|bersahabat|grosir|termurah)|murah\s+(banget|meriah|pol)|super\s+murah|termurah|harga\s+promo)\b/gi
  ];
  function stripPrice(text) {
    let t = String(text || "");
    for (const re of PRICE_PATTERNS) t = t.replace(re, "");
    return t
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.!?])/g, "$1")
      .replace(/^[ \t]*[,.:;-]+[ \t]*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // OUTPUT-side rating guard (Fikri's rule 2026-10-09: no rating anywhere).
  const RATING_PATTERNS = [
    /#(?:rating|bintang|review|ulasan)\w*/gi,                                      // hashtags first
    /(⭐️?|★|☆)+\s?(\d(?:[.,]\d)?(?:\s?\/\s?5)?)?/g,                           // ⭐⭐⭐⭐⭐  ⭐4.9
    /\b(?:rating|rate)\s*:?\s*\d(?:[.,]\d)?(?:\s?\/\s?5)?/gi,                  // rating 4.9, Rating: 4.8/5
    /\b\d(?:[.,]\d)?\s?\/\s?5\b/g,                                            // 4.9/5
    /\b(?:rating|ulasan|review)\s+(?:tinggi|bagus|sempurna|terbaik|bintang\s*\w+)\b/gi,
    /\b(?:bintang\s*(?:5|lima)|(?:5|lima)\s*bintang)\b/gi,                     // bintang 5, 5 bintang
    /\b(?:ribuan|ratusan|puluhan)\s+(?:review|ulasan|penilaian)\b/gi,
    /\b\d[\d.,]*\s?(?:rb|ribu|k)?\+?\s*(?:review|ulasan|penilaian)\b/gi         // 2rb review, 1.200 ulasan
  ];
  function stripRating(text) {
    let t = String(text || "");
    for (const re of RATING_PATTERNS) t = t.replace(re, "");
    return t
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.!?])/g, "$1")
      .replace(/([,.!?])\s*\1+/g, "$1")
      .replace(/^[ \t]*[,.:;-]+[ \t]*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // OUTPUT-side engagement-bait guard (v0.9.33). The prompt forbids explicit
  // like/share/tag/comment-word/vote asks because FB/IG demote them, but a
  // model or a stale stored captionPrompt can still write one. Drop only the
  // offending SENTENCE so the keyword line and "cek link" CTA survive.
  const BAIT_PATTERNS = [
    /\b(kasih|klik|tekan|tap|pencet)\s+(like|love|react)\b/i,
    /\b(like|share|komen|comment)\s+(dan|&|\+|and|terus)\s+(share|like|komen|comment|follow|bagikan)\b/i,
    /\b(like|love|react|double\s*tap)\s+(kalau|kalo|jika|untuk|buat)\b/i,
    /\b(jangan\s+lupa|yuk|ayo)\s+(like|share|bagikan|komen|comment)\b/i,
    /\b(share|bagikan|kirim(?:kan)?|teruskan)\b[^.!?\n]{0,25}\b(ke|buat|untuk)\s+(temen|teman|sahabat|pasangan|bestie|keluarga|grup|ayang|pacar)\w*\b/i,
    /\b(share|bagikan)\s+(video|postingan|post|reels?|konten)\s+ini\b/i,
    /\btag\s+(temen|teman|sahabat|pasangan|bestie|pacar|ayang|seseorang|orang|keluarga)\w*\b/i,
    /\b(komen|comment|ketik|tulis)\s+["“'‘]?[A-Za-z0-9]{1,8}["”'’]?\s+(kalau|kalo|jika|di\s+kolom|di\s+komen|kalau\s+mau)\b/i
  ];
  function stripEngagementBait(text) {
    const lines = String(text || "").split("\n").map((line) => {
      if (/^\s*#/.test(line) || /https?:\/\//.test(line)) return line;   // tags & links untouched
      if (!BAIT_PATTERNS.some((re) => re.test(line))) return line;
      const parts = line.match(/[^.!?]+[.!?]*\s*/g) || [line];
      return parts.filter((s) => !BAIT_PATTERNS.some((re) => re.test(s))).join("").trim();
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function ensureHashtags(text, product) {
    let t = stripEngagementBait(stripPrice(stripRating(text)))
      // 10.10 campaign is over (Fikri 2026-10-11): strip the dead tags if a
      // stale stored captionPrompt still produces them.
      .replace(/#1010(BrandsFestival|ShopeeMall)\b/gi, "")
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
    if (tagCount >= 6) return ensureDisclaimer(ensureNicheTags(t, product));
    const block = [nicheTags(product.name).join(" "), slugTags(product.name), FYP_TAGS, SHOP_TAGS]
      .filter(Boolean).join(" ");
    return ensureDisclaimer(ensureNicheTags(t.replace(/\s*$/, "") + "\n\n" + block, product));
  }

  // Exactly ONE canonical disclaimer line, sitting right above the hashtag line
  // (so it stays part of the caption body, not lost among the tags). Any
  // model-written variant ("*produk mungkin sedikit berbeda") is replaced, so a
  // stale stored captionPrompt still ends up with the disclaimer.
  function ensureDisclaimer(text) {
    const lines = String(text || "").split("\n")
      .filter((l) => !/mungkin\s+(sedikit\s+)?berbeda/i.test(l));
    const isTagLine = (l) => {
      const toks = l.trim().split(/\s+/).filter(Boolean);
      return toks.length >= 2 && toks.filter((w) => w.startsWith("#")).length >= toks.length - 1;
    };
    let idx = -1;
    for (let i = lines.length - 1; i >= 0; i--) if (isTagLine(lines[i])) { idx = i; break; }
    if (idx === -1) {
      return (lines.join("\n").replace(/\s*$/, "") + "\n" + CAPTION_DISCLAIMER).trim();
    }
    const body = lines.slice(0, idx).join("\n").replace(/\s*$/, "");
    const tags = lines.slice(idx).join("\n");
    return ((body ? body + "\n" : "") + CAPTION_DISCLAIMER + "\n\n" + tags).trim();
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
    // Caption + video for one open experiment must use ONE concept. Reuse the
    // concept already chosen on this product until "Eksperimen Baru" resets it.
    try {
      const held = product && (product.__experimentConcept || product.__concept);
      if (held && global.RMConcepts && global.RMConcepts.byId) {
        const same = global.RMConcepts.byId(held);
        if (same) return same;
      }
    } catch (_) {}
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
    // Concept-performance logging happens only after RMExperiment creates the
    // exact campaign/tag ID. Logging the broad base tag here gave every concept
    // the same lifetime ROAS and produced false "winning concept" signals.
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
    product.__concept = concept ? concept.id : null;
    product.__experimentConcept = product.__concept;
    const raw = await call(cfg, tpl.replace(/{{context}}/g, ctx)
      .replace(/{{CONCEPT}}/g, conceptBlock(concept, false))
      .replace(/{{NICHE_TAGS}}/g, nicheTags(product.name).join(" "))
      .replace(/{{name}}/g, product.name || "")
      .replace(/{{price}}/g, ""), 0.75);
    return appendShortLink(ensureHashtags(raw, product), cfg, product);
  }

  // Build an official Shopee affiliate short link per Shopee's doc
  // (help.shopee.co.id article 184879). Format:
  //   https://s.shopee.co.id/an_redir?origin_link=<ENCODED_PRODUCT_URL>?&affiliate_id=<id>&sub_id=<tag>----
  // sub_id slot 1 = our tag (= utm_content Shopee records, used by campaign_to_tag).
  // Returns null when we lack affiliate_id or a resolvable product URL.
  function buildShortLink(cfg, product) {
    const aff = cfg && cfg.ai && (cfg.ai.affiliateId || "").trim();
    if (!aff) return null;
    // resolve the product URL: prefer href, else rebuild from shopid/itemid
    let url = product.href || product.url || null;
    if (!url && product.shopid && product.itemid)
      url = `https://shopee.co.id/product/${product.shopid}/${product.itemid}`;
    if (!url) return null;
    // keep the camelCase tag as-is (naming convention); just strip unsafe chars
    const tag = (product.suggestedTag || toCamelTag(product.name || "") || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
    const enc = encodeURIComponent(url);
    const subId = `${tag}----`;   // slot1=tag, slots 2-5 reserved (network/source/custom)
    return `https://s.shopee.co.id/an_redir?origin_link=${enc}?&affiliate_id=${aff}&sub_id=${subId}`;
  }

  // Append the ready-to-copy short link under the caption. When affiliate_id is
  // missing, append a clear NOTICE instead of silently dropping the link.
  function appendShortLink(caption, cfg, product) {
    const aff = cfg && cfg.ai && (cfg.ai.affiliateId || "").trim();
    if (!aff) {
      return caption.replace(/\s*$/, "") +
        "\n\n⚠️ Affiliate ID belum diisi di Admin Panel — short-link tidak dibuat. Isi dulu untuk link otomatis.";
    }
    const link = buildShortLink(cfg, product);
    if (!link) {
      return caption.replace(/\s*$/, "") +
        "\n\n⚠️ Short-link gagal dibuat: URL produk tidak terbaca (buka dari halaman produk Shopee).";
    }
    return caption.replace(/\s*$/, "") + "\n\n🔗 " + link;
  }
  async function generateTag(cfg, product) {
    // Naming convention (dari XLSX harian Fikri): camelCase deskriptif, ringkas
    // dari nama produk — mis. "Coach Phone Case" -> coachPhone, "Red Chef Tumbler"
    // -> redchefTumbler. Harus UNIK & nyambung ke produk (bukan acak).
    try {
      const raw = await call(cfg, fill(cfg.ai.tagPrompt, product), 0.2);
      const t = toCamelTag(raw);
      if (t) return t;
    } catch (_) { /* fall back to local derivation below */ }
    return toCamelTag(product.name || "") || localTag(product);
  }

  // Convert any string to camelCase tag: words joined, first lower, rest Capped,
  // alnum only, max 20 chars. "Red Chef Tumbler" -> "redChefTumbler".
  function toCamelTag(s) {
    const words = String(s).replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);
    if (!words.length) return "";
    const camel = words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
    return camel.slice(0, 20);
  }
  // Deterministic last-resort tag so two different products never collide.
  function localTag(product) {
    const base = toCamelTag(product.name || "produk") || "produk";
    const sig = String(product.itemid || product.id || Date.now()).slice(-4);
    return (base.slice(0, 14) + sig).slice(0, 20);
  }

  // Lean context. Fikri's rules: NO price (2026-10-02) and, since 2026-10-09,
  // NO rating either. Neither price, rating, jumlah terjual nor review counts
  // are passed to the AI, so they can never leak into a caption or video prompt.
  // (Rating stays in the research panel/dataset — it only never reaches the AI.)
  function productContext(p) {
    const parts = [];
    if (p.name) parts.push("Nama produk (SEBUT dalam video/caption): " + p.name);
    // Fikri's rule (2026-10-02): NO PRICE in video prompt or caption. Price is
    // deliberately NOT passed to the AI (same pattern as jumlah terjual).
    parts.push("LARANGAN HARGA: JANGAN sebut, tulis, atau singgung HARGA dalam bentuk apa pun — tidak ada angka Rp, diskon, potongan, promo, persentase hemat, 'murah', 'terjangkau', 'harga miring', atau perbandingan harga.");
    parts.push("LARANGAN RATING: " + RATING_BAN);
    if (p.commissionPct != null || (p.economics && p.economics.commissionPct))
      parts.push("Komisi: " + (p.commissionPct || p.economics.commissionPct) + "%");
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
    // A custom template without {{context}} used to drop the product data AND
    // the price ban entirely — append it, same as the caption path does.
    const tpl = custom
      ? (/{{context}}/.test(custom) ? custom : custom + "\n\nData produk: {{context}}")
      : (handsMode ? HANDS_VIDEO_PROMPT : DEFAULT_VIDEO_PROMPT);
    const sizeBlock = handsMode ? ""
      : (size === "large" ? SIZE_RULES_LARGE : SIZE_RULES_JUDGE);
    // Phone cases get extra hard rules (female manicured hands; never flip the
    // phone — shake/tilt instead, because flipping makes the AI render a case on
    // both sides). Any other product drops the placeholder entirely.
    const caseBlock = isPhoneCase(product.name) ? CASE_RULES : "";
    const concept = await pickConcept(product, cfg);
    product.__concept = concept ? concept.id : null;   // for UI labelling / logging
    product.__experimentConcept = product.__concept;  // caption/video share one experiment
    const instruction = tpl
      .replace(/{{GEMINI_RULES}}/g, GEMINI_RULES)
      .replace(/{{SIZE_RULES}}/g, sizeBlock)
      .replace(/{{CASE_RULES}}/g, caseBlock)
      .replace(/{{CONCEPT}}/g, conceptBlock(concept, true))
      .replace(/{{context}}/g, ctx)
      .replace(/{{name}}/g, product.name || "")
      .replace(/{{price}}/g, "");   // was left as literal "{{price}}" here
    // NOTE: no mode label is prefixed — the whole textarea gets pasted into
    // Gemini/Veo, so any bracketed note would become noise in the prompt.
    // The mode is surfaced in the panel's section title instead (see content.js).
    return stripPrice(stripRating(await call(cfg, instruction, 0.35)));
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
                  isPhoneAccessory, isHandheld, isPhoneCase, productSize, videoMode,
                  ensureHashtags, stripPrice, stripRating, stripEngagementBait, BAIT_PATTERNS, RATING_BAN, NICHE_TAGS, nicheTags, ensureNicheTags, ensureDisclaimer, CAPTION_DISCLAIMER, DEFAULT_CAPTION_PROMPT, buildShortLink, appendShortLink, generateTag, toCamelTag };
})(typeof window !== "undefined" ? window : this);
