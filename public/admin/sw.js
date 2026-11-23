// 관리자 앱(홈 화면 설치)용 최소 서비스워커 – 아무것도 저장하지 않음(토큰·데이터는 항상 GitHub에서 새로)
// 인터넷이 끊겼을 때 관리자 화면 대신 안내만 보여 줌
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
const OFFLINE = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI시네마 관리</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b10;color:#f3f3f7;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:20px">인터넷 연결을 확인해 주세요</h1><p style="color:#a0a0b4">연결되면 다시 열어 주세요.</p></div>`;
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
