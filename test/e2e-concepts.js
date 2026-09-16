/* e2e-concepts.js — kunci ROTASI KONSEP (autopilot 2026-09-16).
 * Riset: Meta Andromeda + TikTok anti-mass-production menghukum video seragam.
 * Generator harus memutar konsep berbeda tiap video & menyuntik arahannya ke
 * prompt video DAN caption.
 */
"use strict";
const fs = require("fs"), vm = require("vm");

const store = {};
const chrome = { storage: { local: {
  get: (k, cb) => cb(Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,store[x]]))),
  set: (o, cb) => { Object.assign(store,o); cb&&cb(); } } } };
const ctx = { console, chrome };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+"/../src/concepts.js","utf8"), ctx);
vm.runInContext(fs.readFileSync(__dirname+"/../src/ai.js","utf8"), ctx);
const { RMConcepts, RMAi } = ctx.window;

let sent=null;
ctx.fetch=async(u,o)=>{sent=JSON.parse(o.body).messages.map(m=>m.content).join("\n");
  return {ok:true,json:async()=>({choices:[{message:{content:"caption\n\n#fyp #viral #casinghp #racunshopee"}}]})};};
const cfg={ai:{enabled:true,apiKey:"sk",model:"m",baseUrl:"https://api.deepseek.com",videoPrompt:"",captionPrompt:""}};

let ok=true; const chk=(n,c,d)=>{console.log(`${c?"PASS":"FAIL"}  ${n}${d?"  "+d:""}`);if(!c)ok=false;};

(async()=>{
  chk("ada >=6 konsep", RMConcepts.all().length>=6, `n=${RMConcepts.all().length}`);

  const seen=[];
  for(let i=0;i<RMConcepts.all().length;i++){ const c=await RMConcepts.next("KupuA17"); seen.push(c.id); }
  const uniq=new Set(seen);
  chk("satu siklus penuh tanpa ulang", uniq.size===seen.length, `seen=${seen.join(",")}`);

  sent=null;
  await RMAi.generateVideoPrompt(cfg, {name:"Soft Case Samsung A17 motif", price:25000, suggestedTag:"KupuA17"});
  chk("video prompt memuat 'KONSEP VIDEO INI'", /KONSEP VIDEO INI/.test(sent||""));
  chk("video prompt memuat aturan VARIASI anti-seragam", /WAJIB VARIASI/.test(sent||""));
  chk("placeholder {{CONCEPT}} tidak bocor di video", !/\{\{CONCEPT\}\}/.test(sent||""));

  sent=null;
  await RMAi.generateCaption(cfg, {name:"Rak dapur susun", price:55000, suggestedTag:"kitchenCounter"});
  chk("caption prompt memuat konsep", /KONSEP VIDEO INI/.test(sent||""));
  chk("caption prompt: hashtag 6-9 (bukan 8-12)", /6-9 hashtag/.test(sent||""));
  chk("caption prompt: tag niat-beli", /niat-beli/.test(sent||""));
  chk("caption placeholder tidak bocor", !/\{\{CONCEPT\}\}/.test(sent||""));

  console.log(ok?"\nCONCEPTS OK":"\nADA YANG GAGAL");
  process.exit(ok?0:1);
})();
