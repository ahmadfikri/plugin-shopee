document.getElementById("admin").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById("shopee").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://shopee.co.id/search?keyword=tas%20anak%20sekolah" });
});
