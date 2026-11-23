// IndexNow: 새로 생기거나 바뀐·삭제된 페이지를 Bing·네이버 등 검색엔진에 바로 알림
//  - 사이트맵(public/sitemap.xml)과 지난번 보낸 기록(cache/indexnow.json)을 비교해서
//    새 주소 / 사라진 주소 / 내용이 바뀐 주소(같은 주소는 하루 1번까지)만 보냄
//  - 키는 공개용(사이트 맨 위 /da601653e528c86bfe4e76ff57921724.txt 에 같은 값) – 비밀값 아님
//  - GitHub Actions 에서 배포가 끝난 뒤에만 실행 (INDEXNOW=1) → 검색엔진이 왔을 때 페이지가 이미 있도록
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "da601653e528c86bfe4e76ff57921724";
const SITE = "https://all-aicinema.syncbrain100.com";
const HOST = new URL(SITE).host;
const CACHE = resolve(ROOT, "cache/indexnow.json");
const ENDPOINTS = ["https://www.bing.com/indexnow", "https://searchadvisor.naver.com/indexnow"];
const RESEND_HOURS = 24, BATCH = 10000;

async function main() {
  if (process.env.INDEXNOW !== "1") { console.log("IndexNow: INDEXNOW=1 일 때만 실행"); return; }
  const xml = await readFile(resolve(ROOT, "public/sitemap.xml"), "utf8");
  const now = new Map();
  for (const [blk] of xml.matchAll(/<url>[\s\S]*?<\/url>/g)) {
    const u = (blk.match(/<loc>([^<]+)<\/loc>/)?.[1] || "").trim();
    if (u.startsWith(SITE + "/")) now.set(u, blk.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || "");
  }
  // 검색엔진마다 따로 기록 (한쪽이 실패하면 그쪽만 다음에 다시 보냄)
  let cache = {};
  try { cache = JSON.parse(await readFile(CACHE, "utf8")) || {}; } catch {}
  if (cache.sent) cache = { [new URL(ENDPOINTS[1]).host]: cache.sent };   // 예전 형식(네이버만 성공한 기록) 이어받기
  // 진단: 검색엔진이 키 파일을 읽을 수 있는지
  try { const r = await fetch(`${SITE}/${KEY}.txt`, { signal: AbortSignal.timeout(10000) }); const txt = (await r.text()).trim(); console.log(`키 파일 ${r.status} ${r.headers.get("content-type")} ${txt === KEY ? "일치" : "불일치: " + txt.slice(0, 40)}`); } catch (e) { console.warn("✗ 키 파일 확인:", e.message); }
  const t = Date.now();
  for (const ep of ENDPOINTS) {
    const name = new URL(ep).host, sent = cache[name] || {}, list = [];
    for (const [u, lm] of now) {
      const s = sent[u];
      if (!s || (s[0] !== lm && t - s[1] > RESEND_HOURS * 3600e3)) list.push(u);
    }
    const gone = Object.keys(sent).filter((u) => !now.has(u));
    list.push(...gone);
    if (!list.length) { console.log(`IndexNow ${name}: 알릴 페이지 없음`); continue; }
    let ok = true;
    for (let i = 0; i < list.length; i += BATCH) {
      const urlList = list.slice(i, i + BATCH);
      const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList });
      try {
        const res = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body, signal: AbortSignal.timeout(20000) });
        let msg = ""; if (!res.ok) { try { msg = (await res.text()).slice(0, 200).replace(/\s+/g, " "); } catch {} }
        console.log(`IndexNow ${name}: ${res.status} (${urlList.length}개) ${msg}`);
        if (!res.ok) ok = false;
      } catch (err) { ok = false; console.warn(`✗ IndexNow ${name}: ${err.message}`); }
    }
    if (!ok) { console.warn(`✗ IndexNow ${name}: 실패 – 다음에 다시 시도`); continue; }
    for (const u of list) if (now.has(u)) sent[u] = [now.get(u), t]; else delete sent[u];
    cache[name] = sent;
    console.log(`IndexNow ${name}: 새·바뀐 페이지 ${list.length - gone.length}개, 삭제된 페이지 ${gone.length}개 알림`);
  }
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(cache));
}
main().catch((e) => { console.warn("✗ IndexNow:", e.message); });
