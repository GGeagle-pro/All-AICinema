/* 공유 바: 링크 복사 (+ 휴대폰은 기기 공유 창). 인라인 스크립트 금지(CSP)라 파일로 둠 */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-share-copy]");
  if (!b) return;
  const url = b.getAttribute("data-share-copy"), bar = b.closest(".share-bar");
  try {
    if (navigator.share && matchMedia("(pointer:coarse)").matches) { await navigator.share({ url, title: document.title }); return; }
  } catch { return; }
  try { await navigator.clipboard.writeText(url); } catch {
    const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); } catch {} t.remove();
  }
  const old = b.textContent; b.textContent = bar?.dataset.copied || "✓"; setTimeout(() => { b.textContent = old; }, 1500);
});
