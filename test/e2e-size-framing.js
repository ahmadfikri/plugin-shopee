/* e2e-size-framing.js — kunci aturan FRAMING BERDASAR UKURAN (Fikri, 2026-09-15):
 *   barang KECIL  -> cukup TANGAN, tanpa wajah/tubuh
 *   barang BESAR  -> PRESENTER dengan TUBUH terlihat (butuh pembanding skala)
 *   tak dikenal   -> AI dinstruksikan menilai sendiri, dengan aturan yang sama
 */
"use strict";
const fs = require("fs"), vm = require("vm");

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../src/ai.js", "utf8"), ctx);
const RMAi = ctx.window.RMAi;

let sent = null;
ctx.fetch = async (url, opts) => {
  sent = JSON.parse(opts.body).messages.map((m) => m.content).join("\n");
  return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
};
const cfg = { ai: { enabled: true, apiKey: "sk-t", model: "m",
                    baseUrl: "https://api.deepseek.com", videoPrompt: "" } };

let ok = true;
const chk = (n, c, d) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); if (!c) ok = false; };

// ---------- klasifikasi ----------
const SMALL = ["Soft Case Samsung A17", "Tumbler stainless 500ml", "Parfum body mist",
               "Dompet kulit pria", "Squishy lucu", "Powerbank 10000mAh"];
const LARGE = ["LEMARI MAESTRO TABITHA LEMARI PAKAIAN PLASTIK",
               "Rak dapur susun 4 tingkat", "Gamis Salsa Set Daily Rayon",
               "Sepatu Derta Crush Clog Wanita", "Tas ransel anak sekolah",
               "Kipas angin berdiri", "Sprei set katun jepang"];

console.log("=== klasifikasi ukuran ===");
for (const n of SMALL) {
  const s = RMAi.productSize(n);
  chk(`KECIL: ${n.slice(0, 36)}`, s === "small", `-> ${s}`);
}
for (const n of LARGE) {
  const s = RMAi.productSize(n);
  chk(`BESAR: ${n.slice(0, 36)}`, s === "large", `-> ${s}`);
}

// barang besar yang mengandung kata handheld harus tetap BESAR
chk("'Sarung bantal & guling' -> large (bukan hands)",
    RMAi.productSize("PAKET SARUNG BANTAL & GULING MOTIF JEJU") === "large",
    `-> ${RMAi.productSize("PAKET SARUNG BANTAL & GULING MOTIF JEJU")}`);
chk("'Tas selempang HP' -> large (tas menang atas hp)",
    RMAi.productSize("Tas selempang HP wanita") === "large",
    `-> ${RMAi.productSize("Tas selempang HP wanita")}`);

(async () => {
  // ---------- KECIL: prompt harus hands-only, tanpa aturan tubuh ----------
  sent = null;
  await RMAi.generateVideoPrompt(cfg, { name: "Tumbler stainless 500ml", price: 60000 });
  const small = sent || "";
  chk("kecil: HANDS-ONLY", /HANDS-ONLY/.test(small));
  chk("kecil: melarang wajah", /TIDAK ADA wajah/.test(small));
  chk("kecil: tanpa blok aturan besar", !/PRODUK BERUKURAN BESAR/.test(small));
  chk("kecil: placeholder ukuran tidak bocor", !/{{SIZE_RULES}}/.test(small));

  // ---------- BESAR: harus minta tubuh + pembanding skala ----------
  sent = null;
  await RMAi.generateVideoPrompt(cfg, { name: "LEMARI PAKAIAN PLASTIK 4 pintu", price: 119000 });
  const large = sent || "";
  chk("besar: ada blok PRODUK BERUKURAN BESAR", /PRODUK BERUKURAN BESAR/.test(large));
  chk("besar: minta TUBUH terlihat", /TUBUH terlihat/.test(large));
  chk("besar: minta pembanding skala", /pembanding skala/.test(large));
  chk("besar: BUKAN hands-only", !/ATURAN WAJIB — HANDS-ONLY/.test(large));
  chk("besar: placeholder tidak bocor", !/{{SIZE_RULES}}/.test(large));

  // ---------- dipakai di badan: harus diminta ditunjukkan saat dipakai ----------
  sent = null;
  await RMAi.generateVideoPrompt(cfg, { name: "Gamis Salsa Set Daily Rayon", price: 132000 });
  const worn = sent || "";
  chk("dipakai: minta tunjukkan saat DIPAKAI", /DIPAKAI/.test(worn));

  // ---------- tak dikenal: AI disuruh menilai sendiri ----------
  sent = null;
  await RMAi.generateVideoPrompt(cfg, { name: "Penyaring santan stainless anti karat", price: 25000 });
  const unk = sent || "";
  chk("tak dikenal: ada blok NILAI SENDIRI UKURAN", /NILAI SENDIRI UKURAN/.test(unk));
  chk("tak dikenal: aturan kecil->tangan ada", /muat di tangan/.test(unk));
  chk("tak dikenal: aturan besar->tubuh ada", /TUBUH terlihat/.test(unk));
  chk("tak dikenal: placeholder tidak bocor", !/{{SIZE_RULES}}/.test(unk));

  // ---------- label UI ----------
  console.log("\n=== label mode ===");
  for (const n of ["Tumbler stainless", "LEMARI PAKAIAN", "Case iPhone 15",
                   "Penyaring santan stainless"]) {
    console.log(`  ${n.padEnd(28)} -> ${RMAi.videoMode(cfg, { name: n })}`);
  }
  chk("label besar menyebut TUBUH",
      /TUBUH/.test(RMAi.videoMode(cfg, { name: "LEMARI PAKAIAN" })));
  chk("label kecil menyebut tangan",
      /tangan/.test(RMAi.videoMode(cfg, { name: "Tumbler stainless" })));

  console.log(ok ? "\nSIZE FRAMING OK" : "\nADA YANG GAGAL");
  process.exit(ok ? 0 : 1);
})();
