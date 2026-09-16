/* video.js — detect a Shopee product VIDEO on the rendered page and give the
 * user a one-click way to grab it.
 *
 * Reality of Shopee video: it is streamed as HLS (.m3u8 playlist of .ts
 * segments), occasionally a direct .mp4. A browser extension CANNOT mux HLS
 * into an mp4 by itself (needs ffmpeg). So "one-click" does the honest thing:
 *   - direct .mp4  -> download the file straight away
 *   - .m3u8 (HLS)  -> copy the playlist URL + a ready ffmpeg command to clipboard,
 *                     and open it so the user's own ffmpeg finishes the job.
 * Everything reads the already-rendered page / network — no API, no login. */
(function (global) {
  "use strict";

  // Find video sources on the page: <video> tags + any m3u8/mp4 URL in the HTML.
  function findVideo() {
    const out = { mp4: [], m3u8: [], posters: [] };
    document.querySelectorAll("video").forEach((v) => {
      if (v.src) (/\.m3u8/.test(v.src) ? out.m3u8 : out.mp4).push(v.src);
      if (v.currentSrc) (/\.m3u8/.test(v.currentSrc) ? out.m3u8 : out.mp4).push(v.currentSrc);
      const s = v.querySelector("source");
      if (s && s.src) (/\.m3u8/.test(s.src) ? out.m3u8 : out.mp4).push(s.src);
      if (v.poster) out.posters.push(v.poster);
    });
    // scan raw HTML for CDN urls (Shopee often stores them in embedded JSON)
    try {
      const html = document.documentElement.innerHTML;
      (html.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/g) || []).forEach((u) => out.m3u8.push(u));
      (html.match(/https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*/g) || []).forEach((u) => out.mp4.push(u));
    } catch (_) {}
    out.mp4 = [...new Set(out.mp4)];
    out.m3u8 = [...new Set(out.m3u8)];
    return out;
  }

  function hasVideo() {
    const v = findVideo();
    return v.mp4.length > 0 || v.m3u8.length > 0;
  }

  function safeName() {
    const h1 = document.querySelector("h1, span[class*='attM']");
    const base = (h1 ? h1.textContent : document.title || "shopee-video")
      .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
    return base || "shopee-video";
  }

  // One-click grab. Returns a status object the UI shows.
  async function grab() {
    const v = findVideo();
    const name = safeName();
    if (v.mp4.length) {
      // direct file: trigger a download
      const a = document.createElement("a");
      a.href = v.mp4[0]; a.download = name + ".mp4";
      document.body.appendChild(a); a.click(); a.remove();
      return { type: "mp4", url: v.mp4[0], msg: "Video mp4 diunduh: " + name + ".mp4" };
    }
    if (v.m3u8.length) {
      const url = v.m3u8[0];
      const cmd = `ffmpeg -i "${url}" -c copy "${name}.mp4"`;
      try { await navigator.clipboard.writeText(cmd); } catch (_) {}
      return {
        type: "m3u8", url, cmd,
        msg: "Video HLS (.m3u8). Perintah ffmpeg SUDAH disalin ke clipboard — " +
             "tempel di Terminal untuk jadikan mp4:\n\n" + cmd
      };
    }
    return { type: "none", msg: "Tidak ada video di halaman ini (kemungkinan hanya foto)." };
  }

  global.RMVideo = { findVideo, hasVideo, grab, safeName };
})(typeof window !== "undefined" ? window : this);
