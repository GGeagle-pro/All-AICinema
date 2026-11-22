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
const DAYS = 90;   // 날짜별로 쪼갠 기록을 몇 일치 보관할지 (관리자에서 달력으로 아무 기간이나 골라 합산)
const FROM = `${DAYS - 1}daysAgo`;
const RANGES = [
  { startDate: "today", endDate: "today", name: "today" }, { startDate: "yesterday", endDate: "yesterday", name: "yesterday" },
  { startDate: "6daysAgo", endDate: "today", name: "d7" }, { startDate: "29daysAgo", endDate: "today", name: "d30" },
];

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

// 표 압축: { c: [열 이름], r: [[값...]] } – 날짜는 YYYYMMDD 그대로
const table = (rep, cols) => {
  const dh = (rep?.dimensionHeaders || []).map((h) => h.name), mh = (rep?.metricHeaders || []).map((h) => h.name);
  const idx = cols.map((c) => [dh.indexOf(c), mh.indexOf(c)]);
  return { c: cols, r: (rep?.rows || []).map((row) => idx.map(([di, mi]) => (di >= 0 ? row.dimensionValues[di].value : Number(row.metricValues[mi]?.value || 0)))) };
};
const D = (...names) => names.map((name) => ({ name }));
const RANGE = [{ startDate: FROM, endDate: "today" }];
const BIG = 100000;

export async function collect(prop, token) {
  const [totals, daily, events, country, channel] = await batch(prop, token, [
    { dateRanges: RANGES, metrics: D("activeUsers", "newUsers", "sessions", "screenPageViews") },
    { dateRanges: RANGE, dimensions: D("date"), metrics: D("activeUsers", "newUsers", "sessions", "screenPageViews"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "eventName"), metrics: D("eventCount"), dimensionFilter: filterIn("eventName", EVENTS), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "country", "countryId"), metrics: D("activeUsers", "sessions"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "sessionDefaultChannelGroup", "sessionSource"), metrics: D("sessions", "activeUsers"), limit: BIG },
  ]);
  const [device, language, videos, works, search] = await batch(prop, token, [
    { dateRanges: RANGE, dimensions: D("date", "deviceCategory"), metrics: D("activeUsers", "sessions"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "language"), metrics: D("activeUsers"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "pagePath", "pageTitle"), metrics: D("screenPageViews", "activeUsers"), dimensionFilter: begins("pagePath", "/watch/"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "pagePath", "pageTitle"), metrics: D("screenPageViews", "activeUsers"), dimensionFilter: begins("pagePath", "/work/"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "searchTerm"), metrics: D("eventCount"), dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "search" } } }, limit: BIG },
  ]);
  // 시간대별 (어제·오늘)
  const [hourly, hourlyEv] = await batch(prop, token, [
    { dateRanges: [{ startDate: "yesterday", endDate: "today" }], dimensions: D("dateHour"), metrics: D("activeUsers", "screenPageViews"), limit: 100 },
    { dateRanges: [{ startDate: "yesterday", endDate: "today" }], dimensions: D("dateHour", "eventName"), metrics: D("eventCount"), dimensionFilter: filterIn("eventName", EVENTS), limit: 1000 },
  ]);
  // 애드센스 (GA4 에 애드센스를 연결해야 숫자가 나옴 – 안 되어 있으면 건너뜀)
  let ads = null, adsError = "";
  try {
    // 누적(GA4 가 가진 처음부터) · 이번 달 · 지난달 합계도 함께 (90일보다 오래된 수익까지)
    const tz = "Asia/Seoul";
    const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const today = ymd(new Date()), monthStart = today.slice(0, 8) + "01";
    const lastEnd = ymd(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, 0)));   // 지난달 마지막 날
    const lastStart = lastEnd.slice(0, 8) + "01";
    const [a, sums] = await batch(prop, token, [
      { dateRanges: RANGE, dimensions: D("date"), metrics: D("totalAdRevenue", "publisherAdImpressions", "publisherAdClicks"), limit: BIG },
      { dateRanges: [{ startDate: "2015-08-14", endDate: "today", name: "all" }, { startDate: monthStart, endDate: "today", name: "month" }, { startDate: lastStart, endDate: lastEnd, name: "lastMonth" }],
        metrics: D("totalAdRevenue", "publisherAdImpressions", "publisherAdClicks", "screenPageViews") },
    ]);
    const sumOf = {};
    for (const r of rows(sums)) sumOf[r.dateRange] = { revenue: r.totalAdRevenue, impressions: r.publisherAdImpressions, clicks: r.publisherAdClicks, views: r.screenPageViews };
    // 처음 수익이 생긴 날 (누적이 언제부터인지 표시용)
    const firstDay = (a?.rows || []).map((r) => [r.dimensionValues[0].value, Number(r.metricValues[0].value)]).filter(([, v]) => v > 0).map(([d]) => d).sort()[0] || "";
    ads = { currency: a?.metadata?.currencyCode || "", sums: sumOf, firstDay, ...table(a, ["date", "totalAdRevenue", "publisherAdImpressions", "publisherAdClicks"]) };
  } catch (e) { adsError = String(e.message || e).slice(0, 200); }

  const tot = {};
  for (const r of rows(totals)) tot[r.dateRange || "d30"] = { users: r.activeUsers, newUsers: r.newUsers, sessions: r.sessions, views: r.screenPageViews };
  return {
    v: 2, generatedAt: new Date().toISOString(), days: DAYS,
    timeZone: daily?.metadata?.timeZone || "",
    totals: tot,
    daily: table(daily, ["date", "activeUsers", "newUsers", "sessions", "screenPageViews"]),
    events: table(events, ["date", "eventName", "eventCount"]),
    country: table(country, ["date", "country", "countryId", "activeUsers", "sessions"]),
    channel: table(channel, ["date", "sessionDefaultChannelGroup", "sessionSource", "sessions", "activeUsers"]),
    device: table(device, ["date", "deviceCategory", "activeUsers", "sessions"]),
    language: table(language, ["date", "language", "activeUsers"]),
    videos: table(videos, ["date", "pagePath", "pageTitle", "screenPageViews", "activeUsers"]),
    works: table(works, ["date", "pagePath", "pageTitle", "screenPageViews", "activeUsers"]),
    search: table(search, ["date", "searchTerm", "eventCount"]),
    hourly: table(hourly, ["dateHour", "activeUsers", "screenPageViews"]),
    hourlyEv: table(hourlyEv, ["dateHour", "eventName", "eventCount"]),
    ads, adsError,
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
  console.log(`통계 저장: 최근 30일 방문자 ${data.totals.d30?.users ?? 0}명, 일별 ${data.daily.r.length}일, 애드센스 ${data.ads ? `${data.ads.r.length}일` : "없음(" + data.adsError + ")"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("통계 실패:", e.message); process.exit(1); });
}
export { encrypt };
