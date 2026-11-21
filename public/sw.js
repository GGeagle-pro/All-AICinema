// All AI-Cinema 서비스워커 – 홈 화면에 추가(앱 설치)를 위한 최소 기능만 합니다.
// 페이지·영상 목록을 저장해 두지 않아서 항상 최신 화면이 열립니다. 인터넷이 끊겼을 때만 안내 화면을 보여줍니다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
const OFFLINE = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>All AI-Cinema</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b10;color:#f3f3f7;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:20px">인터넷 연결을 확인해 주세요</h1><p style="color:#a0a0b4">연결되면 다시 열어 주세요.</p></div>`;
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;   // 페이지 이동만 처리, 나머지는 브라우저가 그대로
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
