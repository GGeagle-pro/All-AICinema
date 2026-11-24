// 애드센스 공식 숫자 가져오기 (AdSense Management API v2, 읽기 전용) → 관리자 > 통계 탭
//  - 애드센스 화면과 같은 '예상 수입'·잔고·RPM·CTR·CPC
//  - 필요한 GitHub Secrets (없으면 건너뜀):
//      ADSENSE_CLIENT_ID / ADSENSE_CLIENT_SECRET : 구글 클라우드 OAuth 클라이언트(웹 애플리케이션)
//      ADSENSE_REFRESH_TOKEN                      : OAuth Playground 에서 애드센스 계정으로 한 번 승인해 받은 새로고침 토큰
//                                                  (범위: https://www.googleapis.com/auth/adsense.readonly – 읽기만 가능)
//  - 외부 패키지 없이 fetch 만 사용

const API = "https://adsense.googleapis.com/v2";

async function token({ id, secret, refresh }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`애드센스 로그인 실패 (${res.status}): ${j.error_description || j.error || "새로고침 토큰을 확인해 주세요"}`);
  return j.access_token;
}

async function get(path, tok, params) {
  const q = params ? "?" + params.toString() : "";
  const res = await fetch(`${API}/${path}${q}`, { headers: { Authorization: `Bearer ${tok}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`애드센스 API 실패 (${res.status}): ${j.error?.message || ""}`.slice(0, 300));
  return j;
}

const METRICS = ["ESTIMATED_EARNINGS", "PAGE_VIEWS", "IMPRESSIONS", "CLICKS"];
const ymdParts = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; };

// 보고서 요청 (range: 프리셋 이름 또는 [시작, 끝] "YYYY-MM-DD")
function reportParams(range, dims = []) {
  const p = new URLSearchParams();
  if (Array.isArray(range)) {
    const a = ymdParts(range[0]), b = ymdParts(range[1]);
    p.set("dateRange", "CUSTOM");
    p.set("startDate.year", a.y); p.set("startDate.month", a.m); p.set("startDate.day", a.d);
    p.set("endDate.year", b.y); p.set("endDate.month", b.m); p.set("endDate.day", b.d);
  } else p.set("dateRange", range);
  for (const d of dims) p.append("dimensions", d);
  for (const m of METRICS) p.append("metrics", m);
  p.set("reportingTimeZone", "ACCOUNT_TIME_ZONE");
  return p;
}
const num = (v) => Number(v || 0);
// 합계 행 → { earnings, pageViews, impressions, clicks }
const totalsOf = (rep) => {
  const h = (rep.headers || []).map((x) => x.name), c = rep.totals?.cells || [];
  const v = (n) => num(c[h.indexOf(n)]?.value);
  return { earnings: v("ESTIMATED_EARNINGS"), pageViews: v("PAGE_VIEWS"), impressions: v("IMPRESSIONS"), clicks: v("CLICKS") };
};
const rowsOf = (rep, dims) => {
  const h = (rep.headers || []).map((x) => x.name);
  return (rep.rows || []).map((r) => [...dims.map((d) => r.cells[h.indexOf(d)]?.value || ""), ...METRICS.map((m) => num(r.cells[h.indexOf(m)]?.value))]);
};

export async function collectAdsense(env = process.env) {
  const id = env.ADSENSE_CLIENT_ID, secret = env.ADSENSE_CLIENT_SECRET, refresh = env.ADSENSE_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return null;
  const tok = await token({ id, secret, refresh });
  const accounts = (await get("accounts", tok)).accounts || [];
  const acct = accounts.find((a) => a.state !== "CLOSED") || accounts[0];
  if (!acct) throw new Error("이 구글 계정에 연결된 애드센스 계정이 없어요");
  const A = acct.name;   // accounts/pub-…
  const tz = acct.timeZone?.id || "America/Los_Angeles";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const shift = (s, n) => { const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n)); return d.toISOString().slice(0, 10); };
  const monthStart = today.slice(0, 8) + "01";
  const lastEnd = shift(monthStart, -1), lastStart = lastEnd.slice(0, 8) + "01";
  const since = shift(today, -(3 * 365 - 2));   // 애드센스 보고서는 최근 약 3년치
  const rep = (range, dims) => get(`${A}/reports:generate`, tok, reportParams(range, dims));

  const [tdy, yday, d7, month, last, life, daily, country] = await Promise.all([
    rep("TODAY"), rep("YESTERDAY"), rep("LAST_7_DAYS"), rep("MONTH_TO_DATE"),
    rep([lastStart, lastEnd]), rep([since, today]),
    rep([shift(today, -89), today], ["DATE"]),
    rep([shift(today, -89), today], ["DATE", "COUNTRY_CODE"]),
  ]);
  // 잔고(아직 지급 안 된 수입)와 최근 지급
  let balance = "", lastPayment = null;
  try {
    const pays = (await get(`${A}/payments`, tok)).payments || [];
    balance = pays.find((p) => /\/unpaid$/.test(p.name))?.amount || "";
    const paid = pays.filter((p) => !/\/unpaid$/.test(p.name) && p.date).sort((a, b) => (`${b.date.year}${String(b.date.month).padStart(2, "0")}${String(b.date.day).padStart(2, "0")}` < `${a.date.year}${String(a.date.month).padStart(2, "0")}${String(a.date.day).padStart(2, "0")}` ? -1 : 1));
    if (paid[0]) lastPayment = { amount: paid[0].amount, date: `${paid[0].date.year}-${String(paid[0].date.month).padStart(2, "0")}-${String(paid[0].date.day).padStart(2, "0")}` };
  } catch {}
  const currency = (tdy.headers || []).find((h) => h.name === "ESTIMATED_EARNINGS")?.currencyCode || "USD";
  return {
    at: new Date().toISOString(), account: A.replace(/^accounts\//, ""), timeZone: tz, currency, today,
    sums: { today: totalsOf(tdy), yesterday: totalsOf(yday), d7: totalsOf(d7), month: totalsOf(month), lastMonth: totalsOf(last), all: totalsOf(life) },
    allSince: since, balance, lastPayment,
    daily: { c: ["date", ...METRICS], r: rowsOf(daily, ["DATE"]).map((r) => [r[0].replace(/-/g, ""), ...r.slice(1)]) },
    country: { c: ["date", "country", ...METRICS], r: rowsOf(country, ["DATE", "COUNTRY_CODE"]).map((r) => [r[0].replace(/-/g, ""), ...r.slice(1)]) },
  };
}
