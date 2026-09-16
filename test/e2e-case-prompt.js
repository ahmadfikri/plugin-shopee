/* e2e-case-prompt.js — kunci aturan prompt KHUSUS CASING HP (2026-09-15).
 *
 * Dua koreksi dari hasil Veo nyata Fikri:
 *  1. Produk casing WAJIB pakai tangan PEREMPUAN terawat + kuku berkutek.
 *  2. HP JANGAN dibolak-balik — AI jadi ngaco (casing muncul di depan DAN belakang).
 *     Gantinya digoyang/dimiringkan pelan.
 *
 * Tes memeriksa isi instruksi yang dikirim ke AI (bukan output AI-nya).
 */
"use strict";
const fs = require("fs"), vm = require("vm");

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../src/ai.js", "utf8"), ctx);
const RMAi = ctx.window.RMAi;

// intercept the outbound instruction instead of calling DeepSeek
let sent = null;
ctx.fetch = async (url, opts) => {
  sent = JSON.parse(opts.body).messages.map((m) => m.content).join("\n");
  return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
};

const cfg = { ai: { enabled: true, apiKey: "sk-test", model: "deepseek-chat",
                    baseUrl: "https://api.deepseek.com", videoPrompt: "" } };

let ok = true;
const chk = (n, c, d) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); if (!c) ok = false; };

(async () => {
  // ---- detector ----
  chk("deteksi casing: 'Soft Case Samsung A17'", RMAi.isPhoneCase("Soft Case Samsung A17"));
  chk("deteksi casing: 'Casing Untuk OPPO A58'", RMAi.isPhoneCase("Casing Untuk OPPO A58"));
  chk("deteksi casing: 'Kesing HP motif'", RMAi.isPhoneCase("Kesing HP motif"));
  chk("BUKAN casing: 'Tumbler stainless 500ml'", !RMAi.isPhoneCase("Tumbler stainless 500ml"));
  chk("BUKAN casing: 'Rak dapur serbaguna'", !RMAi.isPhoneCase("Rak dapur serbaguna"));

  // ---- CASE product: rules must be present ----
  sent = null;
  await RMAi.generateVideoPrompt(cfg, { name: "Soft Case Samsung A17 motif kupu", price: 25000 });
  const caseTxt = sent || "";
  chk("casing: minta TANGAN PEREMPUAN", /TANGAN PEREMPUAN/.test(caseTxt));
  chk("casing: minta kuku berkutek", /KUTEK/i.test(caseTxt));
  chk("casing: melarang membalik HP", /JANGAN PERNAH membalik/i.test(caseTxt));
  chk("casing: menyebut alasan (casing di kedua sisi)", /KEDUA sisi/i.test(caseTxt));
  chk("casing: menyuruh digoyang/dimiringkan", /GOYANGKAN|miringkan/i.test(caseTxt));
  chk("casing: batasi orbit ~30 derajat", /30 derajat/.test(caseTxt));
  chk("casing: tetap HANDS-ONLY tanpa wajah", /TIDAK ADA wajah/.test(caseTxt));
  chk("casing: TIDAK ada instruksi putar 360 tanpa syarat",
      !/putar 360[,)]/.test(caseTxt) || /hanya jika produk BUKAN casing/.test(caseTxt));

  // ---- NON-case handheld: rules must be ABSENT ----
  sent = null;
  await RMAi.generateVideoPrompt(cfg, { name: "Tumbler stainless 500ml", price: 60000 });
  const tumTxt = sent || "";
  chk("non-casing: tanpa blok aturan casing", !/KHUSUS CASING HP/.test(tumTxt));
  chk("non-casing: placeholder tidak bocor", !/{{CASE_RULES}}/.test(tumTxt));
  chk("non-casing: pilihan tangan masih bebas sesuai target pasar",
      /produk pria → tangan pria/.test(tumTxt));

  // ---- placeholder never leaks anywhere ----
  chk("casing: placeholder tidak bocor", !/{{CASE_RULES}}/.test(caseTxt));

  // ---- UI label ----
  const label = RMAi.videoMode(cfg, { name: "Case iPhone 15 polkadot" });
  console.log("  label mode:", label);
  chk("label mode menyebut CASING", /CASING/.test(label));

  console.log(ok ? "\nCASE PROMPT OK" : "\nADA YANG GAGAL");
  process.exit(ok ? 0 : 1);
})();
