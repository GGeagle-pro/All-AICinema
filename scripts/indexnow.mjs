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
const ENDPOINTS = ["https://api.indexnow.org/indexnow", "https://searchadvisor.naver.com/indexnow"];
const RESEND_HOURS = 24, BATCH = 10000;

async function main() {
  if (process.env.INDEXNOW !== "1") { console.log("IndexNow: INDEXNOW=1 일 때만 실행"); return; }
  const xml = await readFile(resolve(ROOT, "public/sitemap.xml"), "utf8");
  const now = new Map();
  for (const [blk] of xml.matchAll(/<url>[\s\S]*?<\/url>/g)) {
    const u = (blk.match(/<loc>([^<]+)<\/loc>/)?.[1] || "").trim();
    if (u.startsWith(SITE + "/")) now.set(u, blk.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || "");
  }
  let sent = {};
  try { sent = JSON.parse(await readFile(CACHE, "utf8")).sent || {}; } catch {}
  const t = Date.now(), list = [];
  for (const [u, lm] of now) {
    const s = sent[u];
    if (!s || (s[0] !== lm && t - s[1] > RESEND_HOURS * 3600e3)) list.push(u);
  }
  const gone = Object.keys(sent).filter((u) => !now.has(u));
  list.push(...gone);
  if (!list.length) { console.log("IndexNow: 알릴 페이지 없음"); return; }
  let ok = false;
  for (let i = 0; i < list.length; i += BATCH) {
    const urlList = list.slice(i, i + BATCH);
    const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList });
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body, signal: AbortSignal.timeout(20000) });
        console.log(`IndexNow ${new URL(ep).host}: ${res.status} (${urlList.length}개)`);
        if (res.ok) ok = true;
      } catch (err) { console.warn(`✗ IndexNow ${new URL(ep).host}: ${err.message}`); }
    }
  }
  if (!ok) { console.warn("✗ IndexNow: 모든 검색엔진 전송 실패 – 다음에 다시 시도"); return; }
  for (const u of list) if (now.has(u)) sent[u] = [now.get(u), t]; else delete sent[u];
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify({ sent }));
  console.log(`IndexNow: 새·바뀐 페이지 ${list.length - gone.length}개, 삭제된 페이지 ${gone.length}개 알림`);
}
main().catch((e) => { console.warn("✗ IndexNow:", e.message); });
