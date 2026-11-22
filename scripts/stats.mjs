// 관리자 > 통계 탭용 숫자 모으기 (구글 애널리틱스 4 → stats/stats.enc.json)
//  - GitHub Actions(stats.yml)가 6시간마다 실행
//  - 필요한 GitHub Secrets
//      GA_PROPERTY_ID : GA4 속성 번호 (숫자, 예: 512345678)
//      GA_SA_KEY      : 서비스 계정 키(JSON 파일 내용 전체) – GA4 속성에 '뷰어'로 추가해 둔 계정
//      STATS_PASSWORD : 통계 암호 – 저장소가 공개라서 파일을 이 암호로 잠금. 관리자 통계 탭에서 같은 암호를 넣어 봄
//  - 외부 패키지 없이 Node 기본 기능만 사용 (서명·암호화 모두 node:crypto)

import { createSign, pbkdf2Sync, randomBytes, createCipheriv } from "node:crypto";
import { writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "stats/stats.enc.json");
const ITER = 250000;
const EVENTS = ["video_play", "banner_click", "strip_click", "search", "work_open"];
const RANGES = [{ startDate: "6daysAgo", endDate: "today", name: "d7" }, { startDate: "29daysAgo", endDate: "today", name: "d30" }];

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: key.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 }));
  const sig = b64url(createSign("RSA-SHA256").update(`${head}.${body}`).sign(key.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${sig}` }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`구글 로그인 실패 (${res.status}): ${j.error_description || j.error || "키를 확인해 주세요"}`);
  return j.access_token;
}

async function batch(prop, token, requests) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${prop}:batchRunReports`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GA4 보고서 실패 (${res.status}): ${j.error?.message || ""}`);
  return j.reports || [];
}

// 보고서 → [{dims..., metrics...}] (dateRange 가 있으면 range 키로)
function rows(rep) {
  const dh = (rep.dimensionHeaders || []).map((h) => h.name), mh = (rep.metricHeaders || []).map((h) => h.name);
  return (rep.rows || []).map((r) => {
    const o = {};
    dh.forEach((n, i) => (o[n] = r.dimensionValues?.[i]?.value ?? ""));
    mh.forEach((n, i) => (o[n] = Number(r.metricValues?.[i]?.value ?? 0)));
    return o;
  });
}
const byRange = (list, map, limit = 30) => {
  const out = { d7: [], d30: [] };
  for (const r of list) (out[r.dateRange] || out.d30).push(map(r));
  for (const k of Object.keys(out)) out[k] = out[k].slice(0, limit);
  return out;
};
const filterIn = (field, values) => ({ filter: { fieldName: field, inListFilter: { values } } });
const begins = (field, v) => ({ filter: { fieldName: field, stringFilter: { matchType: "BEGINS_WITH", value: v } } });
const desc = (metric) => [{ metric: { metricName: metric }, desc: true }];

function encrypt(obj, password) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, ITER, 32, "sha256");
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final(), c.getAuthTag()]);   // 웹 브라우저(WebCrypto) 형식: 암호문+태그
  return { v: 1, alg: "PBKDF2-SHA256/AES-256-GCM", iter: ITER, salt: salt.toString("base64"), iv: iv.toString("base64"), data: enc.toString("base64") };
}

export async function collect(prop, token) {
  const [totals, daily, events, country, channel] = await batch(prop, token, [
    { dateRanges: RANGES, metrics: ["activeUsers", "newUsers", "sessions", "screenPageViews"].map((name) => ({ name })) },
    { dateRanges: [{ startDate: "29daysAgo", endDate: "today" }], dimensions: [{ name: "date" }], metrics: ["activeUsers", "newUsers", "sessions", "screenPageViews"].map((name) => ({ name })), orderBys: [{ dimension: { dimensionName: "date" } }], limit: 40 },
    { dateRanges: [{ startDate: "29daysAgo", endDate: "today" }], dimensions: [{ name: "date" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: filterIn("eventName", EVENTS), limit: 400 },
    { dateRanges: RANGES, dimensions: [{ name: "country" }, { name: "countryId" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }], orderBys: desc("activeUsers"), limit: 120 },
    { dateRanges: RANGES, dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSource" }], metrics: [{ name: "sessions" }, { name: "activeUsers" }], orderBys: desc("sessions"), limit: 80 },
  ]);
  const [device, language, videos, works, search] = await batch(prop, token, [
    { dateRanges: RANGES, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }], orderBys: desc("activeUsers") },
    { dateRanges: RANGES, dimensions: [{ name: "language" }], metrics: [{ name: "activeUsers" }], orderBys: desc("activeUsers"), limit: 60 },
    { dateRanges: RANGES, dimensions: [{ name: "pagePath" }, { name: "pageTitle" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], dimensionFilter: begins("pagePath", "/watch/"), orderBys: desc("screenPageViews"), limit: 120 },
    { dateRanges: RANGES, dimensions: [{ name: "pagePath" }, { name: "pageTitle" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], dimensionFilter: begins("pagePath", "/work/"), orderBys: desc("screenPageViews"), limit: 60 },
    { dateRanges: RANGES, dimensions: [{ name: "searchTerm" }], metrics: [{ name: "eventCount" }], dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "search" } } }, orderBys: desc("eventCount"), limit: 60 },
  ]);

  const tot = {};
  for (const r of rows(totals)) tot[r.dateRange || "d30"] = { users: r.activeUsers, newUsers: r.newUsers, sessions: r.sessions, views: r.screenPageViews };
  const ev = {};
  for (const r of rows(events)) (ev[r.date] ||= {})[r.eventName] = r.eventCount;
  const day = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return {
    generatedAt: new Date().toISOString(),
    totals: tot,
    daily: rows(daily).map((r) => ({ date: day(r.date), users: r.activeUsers, newUsers: r.newUsers, sessions: r.sessions, views: r.screenPageViews,
      ...Object.fromEntries(EVENTS.map((e) => [e, ev[r.date]?.[e] || 0])) })),
    country: byRange(rows(country), (r) => ({ name: r.country, code: r.countryId, users: r.activeUsers, sessions: r.sessions }), 50),
    channel: byRange(rows(channel), (r) => ({ group: r.sessionDefaultChannelGroup, source: r.sessionSource, sessions: r.sessions, users: r.activeUsers }), 30),
    device: byRange(rows(device), (r) => ({ name: r.deviceCategory, users: r.activeUsers, sessions: r.sessions }), 10),
    language: byRange(rows(language), (r) => ({ name: r.language, users: r.activeUsers }), 20),
    videos: byRange(rows(videos), (r) => ({ path: r.pagePath, title: r.pageTitle, views: r.screenPageViews, users: r.activeUsers }), 30),
    works: byRange(rows(works), (r) => ({ path: r.pagePath, title: r.pageTitle, views: r.screenPageViews, users: r.activeUsers }), 20),
    search: byRange(rows(search), (r) => ({ term: r.searchTerm, count: r.eventCount }), 20),
  };
}

async function main() {
  const prop = String(process.env.GA_PROPERTY_ID || "").replace(/^properties\//, "").trim();
  const keyRaw = process.env.GA_SA_KEY || "", password = process.env.STATS_PASSWORD || "";
  if (!prop || !keyRaw || !password) { console.log("통계: GA_PROPERTY_ID / GA_SA_KEY / STATS_PASSWORD 시크릿이 아직 없어 건너뜀"); return; }
  if (!/^\d{5,15}$/.test(prop)) throw new Error("GA_PROPERTY_ID 는 숫자만 넣어 주세요 (G-로 시작하는 측정 ID가 아니에요)");
  if (password.length < 8) throw new Error("STATS_PASSWORD 는 8자 이상으로 만들어 주세요");
  let key; try { key = JSON.parse(keyRaw); } catch { throw new Error("GA_SA_KEY 에 서비스 계정 JSON 파일 내용 전체를 넣어 주세요"); }
  const token = await accessToken(key);
  const data = await collect(prop, token);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT + ".tmp", JSON.stringify(encrypt(data, password)) + "\n");
  await rename(OUT + ".tmp", OUT);
  console.log(`통계 저장: 최근 30일 방문자 ${data.totals.d30?.users ?? 0}명, 일별 ${data.daily.length}일`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("통계 실패:", e.message); process.exit(1); });
}
export { encrypt };
