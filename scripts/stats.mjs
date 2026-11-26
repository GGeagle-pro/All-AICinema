// 관리자 > 통계 탭용 숫자 모으기 (구글 애널리틱스 4 → stats/stats.enc.json)
//  - GitHub Actions(stats.yml)가 6시간마다 실행
//  - 필요한 GitHub Secrets
//      GA_PROPERTY_ID : GA4 속성 번호 (숫자, 예: 512345678)
//      GA_SA_KEY      : 서비스 계정 키(JSON 파일 내용 전체) – GA4 속성에 '뷰어'로 추가해 둔 계정
//      STATS_PASSWORD : 통계 암호 – 저장소가 공개라서 파일을 이 암호로 잠금. 관리자 통계 탭에서 같은 암호를 넣어 봄
//  - 외부 패키지 없이 Node 기본 기능만 사용 (서명·암호화 모두 node:crypto)

import { createSign, pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectAdsense } from "./adsense.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "stats/stats.enc.json");
const ITER = 250000;
const EVENTS = ["watch_time", "video_play", "banner_click", "strip_click", "banner_view", "strip_view", "search", "work_open", "video_error", "share", "add_favorite"];
const SLOT_EVENTS = ["banner_click", "strip_click", "banner_view", "strip_view"];
const DAYS = 90;   // 날짜별로 쪼갠 기록을 몇 일치 보관할지 (관리자에서 달력으로 아무 기간이나 골라 합산)
const FROM = `${DAYS - 1}daysAgo`;
const RANGES = [
  { startDate: "today", endDate: "today", name: "today" }, { startDate: "yesterday", endDate: "yesterday", name: "yesterday" },
  // 7일·30일은 다 끝난 날만 (어제까지) – 이전 기간(p7·p30)과 같은 조건으로 비교하려고
  { startDate: "7daysAgo", endDate: "yesterday", name: "d7" }, { startDate: "30daysAgo", endDate: "yesterday", name: "d30" },
];
const PREV_RANGES = [
  { startDate: "2daysAgo", endDate: "2daysAgo", name: "d2" },
  { startDate: "14daysAgo", endDate: "8daysAgo", name: "p7" }, { startDate: "60daysAgo", endDate: "31daysAgo", name: "p30" },
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

function decrypt(box, password) {
  const key = pbkdf2Sync(password, Buffer.from(box.salt, "base64"), box.iter || ITER, 32, "sha256");
  const raw = Buffer.from(box.data, "base64"), tag = raw.subarray(raw.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64")); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString("utf8"));
}

// 애드센스 숫자만 새로 고침 (영상 수집 때마다 – GA 통계는 6시간마다 그대로)
//  node scripts/stats.mjs --ads-only
async function adsOnly() {
  const password = process.env.STATS_PASSWORD || "";
  if (!password || !process.env.ADSENSE_REFRESH_TOKEN) { console.log("애드센스: 시크릿이 없어 건너뜀"); return; }
  let data;
  try { data = decrypt(JSON.parse(await readFile(OUT, "utf8")), password); }
  catch { console.log("애드센스: 기존 통계 파일을 열 수 없어 건너뜀 (통계 작업이 먼저 한 번 돌아야 해요)"); return; }
  try { data.adsense = await collectAdsense(); delete data.adsenseError; }
  catch (e) { console.log("애드센스:", String(e.message || e).slice(0, 300)); return; }   // 실패하면 예전 숫자 그대로 둠
  if (!data.adsense) return;
  await writeFile(OUT + ".tmp", JSON.stringify(encrypt(data, password)) + "\n");
  await rename(OUT + ".tmp", OUT);
  const S = data.adsense.sums;
  console.log(`애드센스 새로 고침: 오늘 ${S.today.earnings}, 어제 ${S.yesterday.earnings}, 이번 달 ${S.month.earnings}, 잔고 ${data.adsense.balance || "-"} (${data.adsense.timeZone})`);
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
    { dateRanges: RANGES, metrics: D("activeUsers", "newUsers", "sessions", "screenPageViews", "userEngagementDuration", "engagedSessions") },
    { dateRanges: RANGE, dimensions: D("date"), metrics: D("activeUsers", "newUsers", "sessions", "screenPageViews", "userEngagementDuration", "engagedSessions"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "eventName"), metrics: D("eventCount", "eventValue"), dimensionFilter: filterIn("eventName", EVENTS), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "country", "countryId"), metrics: D("activeUsers", "sessions", "newUsers", "screenPageViews", "userEngagementDuration", "engagedSessions"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "sessionDefaultChannelGroup", "sessionSource"), metrics: D("sessions", "activeUsers"), limit: BIG },
  ]);
  const [device, language, videos, works, search] = await batch(prop, token, [
    { dateRanges: RANGE, dimensions: D("date", "deviceCategory"), metrics: D("activeUsers", "sessions"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "language"), metrics: D("activeUsers"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "pagePath", "pageTitle"), metrics: D("screenPageViews", "activeUsers"), dimensionFilter: begins("pagePath", "/watch/"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "pagePath", "pageTitle"), metrics: D("screenPageViews", "activeUsers"), dimensionFilter: begins("pagePath", "/work/"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "searchTerm"), metrics: D("eventCount"), dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "search" } } }, limit: BIG },
  ]);
  // 국가별 자세히: 국가×이벤트(재생·클릭·검색), 국가×도시, 기간별 '중복 없는' 국가 방문자(오늘·어제·7일·30일 + 비교용 전 기간)
  let countryEv = null, city = null, countryTot = null, countryPrev = null;
  try {
    [countryEv, city, countryTot, countryPrev] = await batch(prop, token, [
      { dateRanges: RANGE, dimensions: D("date", "countryId", "eventName"), metrics: D("eventCount"), dimensionFilter: filterIn("eventName", ["video_play", "banner_click", "strip_click", "search", "share"]), limit: BIG },
      { dateRanges: RANGE, dimensions: D("date", "countryId", "city"), metrics: D("activeUsers", "sessions"), limit: BIG },
      { dateRanges: RANGES, dimensions: D("countryId"), metrics: D("activeUsers", "newUsers"), limit: 1000 },
      { dateRanges: PREV_RANGES, dimensions: D("countryId"), metrics: D("activeUsers", "newUsers"), limit: 1000 },
    ]);
  } catch (e) { console.log("국가 자세히 실패:", String(e.message || e).slice(0, 200)); }
  // 시간대별 (어제·오늘)
  const [hourly, hourlyEv] = await batch(prop, token, [
    { dateRanges: [{ startDate: "yesterday", endDate: "today" }], dimensions: D("dateHour"), metrics: D("activeUsers", "screenPageViews"), limit: 100 },
    { dateRanges: [{ startDate: "yesterday", endDate: "today" }], dimensions: D("dateHour", "eventName"), metrics: D("eventCount", "eventValue"), dimensionFilter: filterIn("eventName", EVENTS), limit: 1000 },
  ]);
  // 유입 경로 자세히: 첫 방문 페이지, 이전 페이지(외부 사이트 주소), 캠페인(UTM)
  const [landing, referrer, campaign] = await batch(prop, token, [
    { dateRanges: RANGE, dimensions: D("date", "landingPage"), metrics: D("sessions"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "pageReferrer"), metrics: D("sessions"), limit: BIG },
    { dateRanges: RANGE, dimensions: D("date", "sessionSourceMedium", "sessionCampaignName"), metrics: D("sessions"), limit: BIG },
  ]);
  // 재생 오류 (사이트 플레이어에서 재생이 안 된 영상: link_url = https://youtu.be/영상ID, link_text = 오류 번호)
  let errors = null;
  try {
    [errors] = await batch(prop, token, [
      { dateRanges: RANGE, dimensions: D("date", "linkUrl", "linkText"), metrics: D("eventCount"), dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "video_error" } } }, limit: BIG },
    ]);
  } catch {}
  // 광고 칸별 노출·클릭 (link_text = banner-1~3, strip-1~6)
  let slots = null;
  try {
    [slots] = await batch(prop, token, [
      { dateRanges: RANGE, dimensions: D("date", "eventName", "linkText", "deviceCategory"), metrics: D("eventCount"), dimensionFilter: filterIn("eventName", SLOT_EVENTS), limit: BIG },
    ]);
  } catch {}
  // 성별·나이대 (GA4 'Google 신호'를 켜야 하고, 사람이 적으면 구글이 숨김 → 실패해도 건너뜀)
  let gender = null, age = null, demoError = "";
  try {
    [gender, age] = await batch(prop, token, [
      { dateRanges: RANGE, dimensions: D("date", "userGender"), metrics: D("activeUsers"), limit: BIG },
      { dateRanges: RANGE, dimensions: D("date", "userAgeBracket"), metrics: D("activeUsers"), limit: BIG },
    ]);
  } catch (e) { demoError = String(e.message || e).slice(0, 200); }

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

  // 실시간 (최근 30분) – 오늘 숫자는 구글 집계가 몇 시간 늦으므로 '지금 접속 중' 확인용
  let realtime = null;
  try {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runRealtimeReport`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ dimensions: D("countryId"), metrics: D("activeUsers", "screenPageViews"), minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const rs = (j.rows || []).map((r) => ({ c: r.dimensionValues?.[0]?.value || "", u: Number(r.metricValues?.[0]?.value || 0), v: Number(r.metricValues?.[1]?.value || 0) }));
      // 나라별로 나눠 받으면 합계가 중복 없는 수와 다를 수 있어 전체는 따로 받지 않고 나라 합으로 (30분 안이라 차이 거의 없음)
      realtime = { users: rs.reduce((t, x) => t + x.u, 0), views: rs.reduce((t, x) => t + x.v, 0), countries: rs.sort((a, b) => b.u - a.u).slice(0, 20), at: new Date().toISOString() };
    }
  } catch {}

  // 점검용: 어제 숫자를 여러 기준으로 (GA 화면 숫자와 맞춰 보기) – 로그에만 출력
  try {
    const [chk] = await batch(prop, token, [{ dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }], metrics: D("activeUsers", "totalUsers", "newUsers", "sessions", "screenPageViews") }]);
    const r = rows(chk)[0] || {};
    const [hc] = await batch(prop, token, [{ dateRanges: [{ startDate: "yesterday", endDate: "today" }], dimensions: D("hour"), metrics: D("activeUsers") }]);
    console.log("점검 hour 값:", rows(hc).map((x) => x.hour).sort().join(","));
    console.log(`점검 어제: activeUsers ${r.activeUsers}, totalUsers ${r.totalUsers}, newUsers ${r.newUsers}, sessions ${r.sessions}, views ${r.screenPageViews}, 임계값 ${chk.metadata?.subjectToThresholding ? "적용" : "없음"}, 시간대 ${chk.metadata?.timeZone}`);
  } catch (e) { console.log("점검 실패", e.message); }
  const tot = {};
  for (const r of rows(totals)) tot[r.dateRange || "d30"] = { users: r.activeUsers, newUsers: r.newUsers, sessions: r.sessions, views: r.screenPageViews, engage: r.userEngagementDuration || 0, engaged: r.engagedSessions || 0 };
  // 비교용 '중복 없는 방문자' (바로 전 기간): 어제의 전날, 이전 7일, 이전 30일 – 관리자 증감 숫자가 위 숫자와 같은 기준이 되게
  //  + 오늘 vs 어제 '같은 시간'(0시 ~ 다 끝난 마지막 시 59분)을 둘 다 같은 조건으로 셈 (tSame·ySame, 중복 없는 수)
  const tzNow = daily?.metadata?.timeZone || "Asia/Seoul";
  const H = Number(new Intl.DateTimeFormat("en-US", { timeZone: tzNow, hour: "2-digit", hourCycle: "h23" }).format(new Date())) - 1;
  try {
    const M4 = D("activeUsers", "newUsers", "sessions", "screenPageViews", "userEngagementDuration", "engagedSessions");
    const reqs = [{ dateRanges: PREV_RANGES, metrics: M4 }];
    if (H >= 0) {
      // GA 'hour' 값이 "9"·"09" 어느 쪽으로 와도 걸리게 둘 다 넣음 (예전엔 "00"~"09"만 넣어 0~9시가 빠졌음)
      const hf = filterIn("hour", Array.from({ length: H + 1 }, (_, i) => [String(i), String(i).padStart(2, "0")]).flat().filter((v, i, a) => a.indexOf(v) === i));
      reqs.push({ dateRanges: [{ startDate: "today", endDate: "today", name: "tSame" }, { startDate: "yesterday", endDate: "yesterday", name: "ySame" }], metrics: M4, dimensionFilter: hf });
    }
    const [prevTot, same] = await batch(prop, token, reqs);
    for (const r of rows(prevTot)) if (r.dateRange) tot[r.dateRange] = { users: r.activeUsers, newUsers: r.newUsers, sessions: r.sessions, views: r.screenPageViews, engage: r.userEngagementDuration || 0, engaged: r.engagedSessions || 0 };
    if (same) {
      for (const k of ["tSame", "ySame"]) tot[k] = { users: 0, newUsers: 0, sessions: 0, views: 0, engage: 0, engaged: 0, hour: H };
      for (const r of rows(same)) if (r.dateRange) tot[r.dateRange] = { users: r.activeUsers || 0, newUsers: r.newUsers || 0, sessions: r.sessions || 0, views: r.screenPageViews || 0, engage: r.userEngagementDuration || 0, engaged: r.engagedSessions || 0, hour: H };
    }
  } catch {}
  return {
    v: 2, generatedAt: new Date().toISOString(), days: DAYS,
    timeZone: daily?.metadata?.timeZone || "",
    totals: tot, realtime,
    daily: table(daily, ["date", "activeUsers", "newUsers", "sessions", "screenPageViews", "userEngagementDuration", "engagedSessions"]),
    events: table(events, ["date", "eventName", "eventCount", "eventValue"]),   // watch_time 의 eventValue = 영상 시청 초
    country: table(country, ["date", "country", "countryId", "activeUsers", "sessions", "newUsers", "screenPageViews", "userEngagementDuration", "engagedSessions"]),
    countryEv: countryEv ? table(countryEv, ["date", "countryId", "eventName", "eventCount"]) : null,
    city: city ? table(city, ["date", "countryId", "city", "activeUsers", "sessions"]) : null,
    // 기간별 국가 방문자(중복 없는 수): { today: { KR: [방문자, 새 방문자] }, yesterday, d7, d30, d2, p7, p30 }
    countryTot: (() => { const o = {}; for (const t of [countryTot, countryPrev]) for (const r of t ? rows(t) : []) { const k = r.dateRange || "d30"; (o[k] ||= {})[r.countryId] = [r.activeUsers, r.newUsers]; } return o; })(),
    channel: table(channel, ["date", "sessionDefaultChannelGroup", "sessionSource", "sessions", "activeUsers"]),
    device: table(device, ["date", "deviceCategory", "activeUsers", "sessions"]),
    language: table(language, ["date", "language", "activeUsers"]),
    videos: table(videos, ["date", "pagePath", "pageTitle", "screenPageViews", "activeUsers"]),
    works: table(works, ["date", "pagePath", "pageTitle", "screenPageViews", "activeUsers"]),
    search: table(search, ["date", "searchTerm", "eventCount"]),
    hourly: table(hourly, ["dateHour", "activeUsers", "screenPageViews"]),
    landing: table(landing, ["date", "landingPage", "sessions"]),
    referrer: table(referrer, ["date", "pageReferrer", "sessions"]),
    campaign: table(campaign, ["date", "sessionSourceMedium", "sessionCampaignName", "sessions"]),
    gender: gender ? table(gender, ["date", "userGender", "activeUsers"]) : null,
    age: age ? table(age, ["date", "userAgeBracket", "activeUsers"]) : null,
    demoError,
    hourlyEv: table(hourlyEv, ["dateHour", "eventName", "eventCount", "eventValue"]),
    errors: errors ? table(errors, ["date", "linkUrl", "linkText", "eventCount"]) : null,
    slots: slots ? table(slots, ["date", "eventName", "linkText", "deviceCategory", "eventCount"]) : null,
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
  // 애드센스 공식 숫자 (ADSENSE_* 시크릿이 있을 때만). 실패해도 GA 통계는 저장
  try { data.adsense = await collectAdsense(); } catch (e) { data.adsenseError = String(e.message || e).slice(0, 300); console.log("애드센스:", data.adsenseError); }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT + ".tmp", JSON.stringify(encrypt(data, password)) + "\n");
  await rename(OUT + ".tmp", OUT);
  console.log(`통계 저장 (GA 시간대 ${data.timeZone || "?"}): 오늘 방문자 ${data.totals.today?.users ?? 0}명·페이지뷰 ${data.totals.today?.views ?? 0}, 어제 방문자 ${data.totals.yesterday?.users ?? 0}명(0~${data.totals.ySame?.hour ?? "-"}시 비교: 오늘 ${data.totals.tSame?.users ?? "-"}명 / 어제 ${data.totals.ySame?.users ?? "-"}명), 최근 30분 ${data.realtime ? data.realtime.users + "명" : "-"}, 최근 30일 방문자 ${data.totals.d30?.users ?? 0}명, 일별 ${data.daily.r.length}일, GA 광고 ${data.ads ? `${data.ads.r.length}일` : "없음(" + data.adsError + ")"}, 애드센스 API ${data.adsense ? `잔고 ${data.adsense.balance || "-"}, 이번 달 ${data.adsense.sums.month.earnings}` : data.adsenseError ? "실패" : "미설정"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv.includes("--ads-only") ? adsOnly() : main()).catch((e) => { console.error("통계 실패:", e.message); process.exit(1); });
}
export { encrypt, decrypt };
