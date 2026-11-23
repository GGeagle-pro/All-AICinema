// 주간 TOP 10: 이번 주(최근 7일) 올라온 AI 영화·드라마를 조회수 순으로 – 매 수집 때 갱신
//  - 이번 주: /top/, /en/top/, /ja/top/, /zh/top/, /es/top/
//  - 지난주 기록(주차별 보관): /top/2026-w48/, /en/top/2026-w48/ – 그 주가 끝나면 더는 바뀌지 않음
//  - seo.mjs 가 호출
import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, HTML_LANG, HOME, loadAll } from "./pages.mjs";

const LANGS = ["ko", "en", "ja", "zh", "es"];
const P = { ko: "/top/", en: "/en/top/", ja: "/ja/top/", zh: "/zh/top/", es: "/es/top/" };
const HREF = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es" };
const TXT = {
  ko: { t: (w) => `주간 AI 영화·드라마 TOP 10 (${w})`, h: "이번 주 AI 영화·드라마 TOP 10", d: (r) => `${r} 사이 유튜브에 올라온 AI 영화·드라마·단편 중 조회수가 가장 높은 10편이에요. 매시간 자동으로 갱신돼요.`, views: "조회수", arch: "지난주 순위", watch: "보기", home: "홈", crumb: "주간 TOP 10" },
  en: { t: (w) => `Weekly Top 10 AI Movies & Dramas (${w})`, h: "Top 10 AI movies and dramas this week", d: (r) => `The 10 most-viewed AI movies, dramas and short films uploaded to YouTube ${r}. Updated every hour.`, views: "views", arch: "Past weeks", watch: "Watch", home: "Home", crumb: "Weekly Top 10" },
  ja: { t: (w) => `週間AI映画・ドラマTOP10（${w}）`, h: "今週のAI映画・ドラマTOP10", d: (r) => `${r}にYouTubeに公開されたAI映画・ドラマ・短編のうち、再生回数が多い10本です。1時間ごとに自動更新されます。`, views: "回視聴", arch: "過去の週", watch: "見る", home: "ホーム", crumb: "週間TOP10" },
  zh: { t: (w) => `每周AI电影与短剧TOP 10（${w}）`, h: "本周AI电影与短剧TOP 10", d: (r) => `${r}期间上传到YouTube的AI电影、短剧和短片中播放量最高的10部，每小时自动更新。`, views: "次观看", arch: "往期排行", watch: "观看", home: "首页", crumb: "每周TOP 10" },
  es: { t: (w) => `Top 10 semanal de películas y series con IA (${w})`, h: "Top 10 de películas y series con IA de esta semana", d: (r) => `Las 10 películas, series y cortos con IA más vistos subidos a YouTube ${r}. Se actualiza cada hora.`, views: "vistas", arch: "Semanas anteriores", watch: "Ver", home: "Inicio", crumb: "Top 10 semanal" },
};
const fmt = (n, l) => new Intl.NumberFormat(HTML_LANG[l], { notation: "compact", maximumFractionDigits: 1 }).format(n);
const day = (d, l) => new Intl.DateTimeFormat(HTML_LANG[l], { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(d);
// ISO 주차 (서울 시간 기준)
function isoWeek(date) {
  const d = new Date(date.getTime() + 9 * 3600e3);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-w${String(w).padStart(2, "0")}`;
}
async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildTop({ PUB, SITE, loadI18n, ver, pagesOn = true }) {
  const { videos } = await loadAll(PUB);
  const now = new Date(), wk = isoWeek(now);
  const since = new Date(now - 7 * 864e5);
  let pool = videos.filter((v) => new Date(v.published) >= since);
  if (pool.length < 10) pool = videos.filter((v) => new Date(v.published) >= new Date(now - 14 * 864e5));
  // 한 채널이 다 차지하지 않게 채널당 3편까지
  const top = [], per = new Map();
  for (const v of pool.sort((a, b) => b.views - a.views)) {
    if ((per.get(v.channel) || 0) >= 3) continue;
    per.set(v.channel, (per.get(v.channel) || 0) + 1); top.push(v);
    if (top.length >= 10) break;
  }
  const watchUrl = (v) => (pagesOn ? `/watch/${v.id}/` : `/?v=${v.id}`);
  // 지난주 기록 목록
  let weeks = [];
  try { weeks = (await readdir(resolve(PUB, "top"))).filter((n) => /^\d{4}-w\d{2}$/.test(n) && n !== wk).sort().reverse(); } catch {}
  let changed = 0;
  const page = async (lang, url, file, title, archive) => {
    const I = await loadI18n(lang), T = TXT[lang];
    const range = `${day(new Date(now - 7 * 864e5), lang)} ~ ${day(now, lang)}`;
    const alts = archive ? "" : LANGS.map((l) => `<link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${P[l]}" />`).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/en/top/" />`;
    const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[lang]}">${esc(T.home)}</a> › <span>${esc(T.crumb)}</span></nav>
    <h1 class="pg-title">${esc(archive ? T.t(wk) : T.h)}</h1>
    <p class="pg-desc">${esc(T.d(range))}</p>
    <ol class="top-list">${top.map((v, i) => `
      <li class="top-item"><span class="top-rank">${i + 1}</span>
        <a class="top-thumb" href="${watchUrl(v)}"><img loading="lazy" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" width="320" height="180" alt="" /></a>
        <div class="top-txt"><a href="${watchUrl(v)}"><h2>${esc(v.title)}</h2></a><p class="muted">${esc(v.channel)} · ${esc(fmt(v.views, lang))} ${esc(T.views)}${v.categories.length ? " · " + v.categories.slice(0, 3).map((c) => esc(I.name(c))).join(", ") : ""}</p></div></li>`).join("")}
    </ol>
    ${!archive && weeks.length && (lang === "ko" || lang === "en") ? `<section class="pg-sec"><h2>${esc(T.arch)}</h2><p>${weeks.slice(0, 26).map((w) => `<a class="geo-tag" href="${lang === "ko" ? "" : "/en"}/top/${w}/">${w.replace("-w", " · W")}</a>`).join(" ")}</p></section>` : ""}
    <p class="pg-all"><a class="btn btn--primary" href="${HOME[lang]}">${esc(T.home)} →</a></p>`;
    const ld = [{ "@context": "https://schema.org", "@type": "ItemList", name: title, url, inLanguage: HTML_LANG[lang], numberOfItems: top.length,
      itemListElement: top.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + watchUrl(v), name: v.title })) }];
    const html = shell({ lang, title: `${title} | All AI-Cinema`, desc: T.d(range), url, image: top[0] ? `https://i.ytimg.com/vi/${top[0].id}/hqdefault.jpg` : `${SITE}/og-image.jpg?v=3`, ogType: "website", ld, body, I, ver, head: alts });
    if (await writeIfChanged(file, html)) changed++;
  };
  if (!top.length) return { changed, urls: [] };
  for (const l of LANGS) await page(l, SITE + P[l], resolve(PUB, P[l].slice(1), "index.html"), TXT[l].t(wk), false);
  // 이번 주 기록 (주가 바뀌면 그대로 남음)
  await page("ko", `${SITE}/top/${wk}/`, resolve(PUB, "top", wk, "index.html"), TXT.ko.t(wk), true);
  await page("en", `${SITE}/en/top/${wk}/`, resolve(PUB, "en/top", wk, "index.html"), TXT.en.t(wk), true);
  const alts = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${P[l]}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en/top/"/>`;
  return {
    changed,
    urls: [...LANGS.map((l) => ({ loc: SITE + P[l], alts })), ...[wk, ...weeks].flatMap((w) => [{ loc: `${SITE}/top/${w}/` }, { loc: `${SITE}/en/top/${w}/` }])],
  };
}
