// 검색엔진(구글·네이버·다음) 최적화 파일 만들기
//  - public/sitemap.xml : 사이트 주소 목록 (서치콘솔·서치어드바이저에 제출)
//  - public/rss.xml     : 최신 영상 50개 (네이버 서치어드바이저 RSS 제출용)
//  - public/index.html  : <!--SSR--> 표시 사이에 최신 영상 목록을 HTML로 미리 넣음
//                         (자바스크립트를 실행하지 않는 검색 로봇도 내용을 읽을 수 있게)
//  - public/{en,ja,zh,es}/index.html : 해외 검색용 언어별 페이지 (제목·설명·hreflang·화면 글자 번역)
// fetch-videos.mjs 가 영상 목록을 저장할 때마다 자동 실행. 단독 실행: node scripts/seo.mjs

import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import vm from "node:vm";
import { buildPages } from "./pages.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = resolve(ROOT, "public");
const SITE = "https://all-aicinema.syncbrain100.com";
const NAME = "All AI-Cinema";
const SSR_COUNT = 24;
const RSS_COUNT = 50;
const VIDEO_ID = /^[\w-]{11}$/;

const xml = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const html = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// JSON-LD 안에서 </script> 로 빠져나가지 못하게
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const cut = (s, n) => { const a = Array.from(String(s || "").replace(/\s+/g, " ").trim()); return a.length > n ? a.slice(0, n - 1).join("").trim() + "…" : a.join(""); };   // 글자 단위 (이모지가 반으로 잘리지 않게)

// ── 해외 검색 노출: 언어별 페이지 ──
// ko = 기본 주소(/), 나머지는 /en/ /ja/ /zh/ /es/ (미국·영국·싱가포르 등 영어권은 /en/, 중화권은 /zh/)
const LANGS = {
  ko: { path: "/", hreflang: "ko", html: "ko", locale: "ko_KR" },
  en: { path: "/en/", hreflang: "en", html: "en", locale: "en_US",
    title: "All AI-Cinema | Watch AI Movies, AI Dramas & AI Short Films",
    desc: "Watch the best AI-generated movies, AI dramas and AI short films in one place. Browse by genre, country and YouTube channel and play instantly — free.",
    ogDesc: "AI-generated movies, dramas and short films in one place. Play instantly, free.",
    keywords: "AI movies, AI movie, AI drama, AI short film, AI generated movie, AI film, AI animation, generative AI video, Sora film, Veo film, AI cinema",
    h1: "All AI-Cinema – Watch AI movies, AI dramas and AI short films",
    ogAlt: "All AI-Cinema – stories made by AI, all in one place",
    listName: "Latest AI movies and dramas", rssTitle: "New AI movies" },
  ja: { path: "/ja/", hreflang: "ja", html: "ja", locale: "ja_JP",
    title: "All AI-Cinema | AI映画・AIドラマ・AI短編をまとめて視聴",
    desc: "AIが作った映画・ドラマ・短編を一か所で。ジャンル・国・YouTubeチャンネル別に選んで、ワンクリックですぐ再生できます（無料）。",
    ogDesc: "AIが作った映画・ドラマ・短編を一か所で。ワンクリックで再生。",
    keywords: "AI映画, AIドラマ, AI短編映画, 生成AI 動画, AIアニメ, AI映像, AIシネマ",
    h1: "All AI-Cinema – AI映画・AIドラマ・AI短編まとめ",
    ogAlt: "All AI-Cinema – AIが作った物語を一か所で",
    listName: "新着のAI映画・ドラマ" },
  zh: { path: "/zh/", hreflang: "zh-Hans", html: "zh-Hans", locale: "zh_CN",
    title: "All AI-Cinema | AI电影·AI短剧·AI微电影在线观看",
    desc: "汇集AI生成的电影、短剧和微电影。按类型、国家和YouTube频道挑选，一键即可免费播放。",
    ogDesc: "AI生成的电影、短剧、微电影一站看全，一键播放。",
    keywords: "AI电影, AI短剧, AI微电影, AI生成视频, AI动画, AIGC影视, AI影院",
    h1: "All AI-Cinema – AI电影·AI短剧·AI微电影合集",
    ogAlt: "All AI-Cinema – AI创作的故事，一站看全",
    listName: "最新AI电影与短剧" },
  es: { path: "/es/", hreflang: "es", html: "es", locale: "es_ES",
    title: "All AI-Cinema | Películas, series y cortos hechos con IA",
    desc: "Las mejores películas, series y cortometrajes creados con inteligencia artificial en un solo lugar. Elige por género, país y canal de YouTube y míralos al instante, gratis.",
    ogDesc: "Películas, series y cortos hechos con IA en un solo lugar. Reproducción al instante.",
    keywords: "películas IA, película hecha con IA, serie IA, cortometraje IA, video generado por IA, cine IA, animación IA",
    h1: "All AI-Cinema – Películas, series y cortos hechos con IA",
    ogAlt: "All AI-Cinema – historias creadas con IA, en un solo lugar",
    listName: "Nuevas películas y series con IA" },
};
const hreflangLinks = () => Object.values(LANGS).map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${SITE}${l.path}" />`).join("\n  ")
  + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/en/" />`;

// 화면 글자 번역에 쓰는 사전(public/assets/i18n.js)을 그대로 불러옴
export async function loadI18n(code) {
  const src = await readFile(resolve(PUB, "assets/i18n.js"), "utf8");
  const store = {};
  const ctx = { window: {}, location: { search: "", pathname: `/${code}/` }, navigator: { language: code, languages: [code], userAgent: "" },
    localStorage: { getItem: () => null, setItem: () => {} }, document: { documentElement: {}, querySelectorAll: () => [] }, Intl, URLSearchParams, console, store };
  vm.runInNewContext(src, ctx, { timeout: 2000 });
  return ctx.window.AIC_I18N;
}

// 기본(한국어) 페이지를 언어별 페이지로 바꿈
function localize(page, code, I) {
  const L = LANGS[code];
  const t = (s) => I.t(s);
  const attr = (s) => html(s).replace(/&#39;/g, "'");
  let p = page;
  p = p.replace(/<html lang="[^"]*">/, `<html lang="${L.html}">`);
  p = p.replace(/<title>[^<]*<\/title>/, `<title>${html(L.title)}</title>`);
  p = p.replace(/(<meta name="description" content=")[^"]*/, `$1${attr(L.desc)}`);
  p = p.replace(/(<meta name="keywords" content=")[^"]*/, `$1${attr(L.keywords)}`);
  p = p.replace(/(<link rel="canonical" href=")[^"]*/, `$1${SITE}${L.path}`);
  p = p.replace(/(<meta property="og:url" content=")[^"]*/, `$1${SITE}${L.path}`);
  p = p.replace(/(<meta property="og:locale" content=")[^"]*/, `$1${L.locale}`);
  p = p.replace(/(<meta property="og:title" content=")[^"]*/, `$1${attr(L.title)}`);
  p = p.replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${attr(L.title)}`);
  p = p.replace(/(<meta property="og:description" content=")[^"]*/, `$1${attr(L.ogDesc)}`);
  p = p.replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${attr(L.ogDesc)}`);
  p = p.replace(/(<meta property="og:image:alt" content=")[^"]*/, `$1${attr(L.ogAlt)}`);
  p = p.replace(/(<h1 class="sr-only">)[^<]*/, `$1${html(L.h1)}`);
  // 구조화 데이터: 언어·설명
  p = p.replace(/"inLanguage": "ko-KR"/, `"inLanguage": "${L.html}"`).replace(/"description": "AI가 만든 영화·드라마·단편을 한곳에서 모아보는 사이트"/, `"description": ${JSON.stringify(L.desc)}`)
    .replace(/("urlTemplate": ")https:\/\/all-aicinema\.syncbrain100\.com\/\?q=/, `$1${SITE}${L.path}?q=`);
  p = p.replace(/"name": "새로 올라온 AI 영화·드라마"/, `"name": ${JSON.stringify(L.listName)}`);
  p = p.replace(/(?<=url":")https:\/\/all-aicinema\.syncbrain100\.com\/\?v=/g, `${SITE}${L.path}?v=`);
  // 하위 폴더에서도 파일을 찾게: 상대 경로 → 절대 경로
  p = p.replace(/\s(href|src)="(?!https?:|\/|#|\?|data:|mailto:)([^"]+)"/g, ' $1="/$2"');
  // 화면 글자 미리 번역 (자바스크립트를 안 돌리는 로봇용) – 원문은 data-* 에 남겨 언어 전환이 그대로 되게
  p = p.replace(/<([a-z0-9]+)([^<>]*?\sdata-i18n(?:="([^"]*)")?)([^<>]*)>([^<]*)</g, (m, tag, a1, key, a2, text) => {
    const src = key || text.trim();
    if (!src || !text.trim()) return m;
    const out = t(src);
    if (out === src) return m;
    const a = key ? `${a1}${a2}` : `${a1.replace(/\sdata-i18n$/, ` data-i18n="${attr(src)}"`)}${a2}`;
    return `<${tag}${a}>${text.replace(text.trim(), html(out))}<`;
  });
  p = p.replace(/<[a-z0-9]+[^<>]*\sdata-i18n-attr="([^"]+)"[^<>]*>/g, (tagStr, list) => {
    let out = tagStr;
    for (const name of list.split(",")) {
      const re = new RegExp(`\\s${name}="([^"]*)"`);
      const mm = out.match(re);
      if (!mm || !mm[1]) continue;
      const src = mm[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      const tr = t(src);
      if (tr === src) continue;
      out = out.replace(re, ` ${name}="${attr(tr)}" data-i18n-src-${name}="${mm[1]}"`);
    }
    return out;
  });
  return p;
}

async function atomicWrite(file, text) { await writeFile(file + ".tmp", text); await rename(file + ".tmp", file); }

async function loadVideos() {
  const d = JSON.parse(await readFile(resolve(PUB, "data/videos.json"), "utf8"));
  let desc = {};
  try { desc = JSON.parse(await readFile(resolve(PUB, "data/desc.json"), "utf8")); } catch {}
  const items = Array.isArray(d.items) ? d.items : [];
  return {
    generatedAt: d.generatedAt || new Date().toISOString(),
    videos: items.map((x) => ({
      id: x[0], title: String(x[1] || ""), channel: String(d.channels?.[x[2]] || ""),
      categories: (Array.isArray(x[3]) ? x[3] : [x[3]]).map((k) => d.cats?.[k]).filter(Boolean),
      published: new Date((x[4] || 0) * 1000).toISOString(), views: x[5] || 0, short: x[6] === 1,
      description: String(desc[x[0]] || ""),
    })).filter((v) => VIDEO_ID.test(v.id))
      .sort((a, b) => new Date(b.published) - new Date(a.published)),
  };
}

function sitemap(lastmod, pages = []) {
  const alts = Object.values(LANGS).map((l) => `<xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${SITE}${l.path}"/>`).join("")
    + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en/"/>`;
  const urls = [
    ...Object.values(LANGS).map((l) => ({ loc: `${SITE}${l.path}`, lastmod, changefreq: "hourly", priority: l.path === "/" ? "1.0" : "0.9", alts })),
    { loc: `${SITE}/about.html`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE}/privacy.html`, changefreq: "yearly", priority: "0.2" },
    // 작품·영상 페이지 (scripts/pages.mjs)
    ...pages.map((u) => ({ loc: u.loc, lastmod: u.lastmod, changefreq: u.loc.includes("/work/") ? "daily" : "weekly", priority: u.loc.includes("/work/") ? "0.8" : "0.6" })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.alts || ""}${u.lastmod ? `<lastmod>${xml(u.lastmod)}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>
`;
}

function rss(videos, lastmod) {
  const items = videos.slice(0, RSS_COUNT).map((v) => `    <item>
      <title>${xml(cut(v.title, 200))}</title>
      <link>${SITE}/?v=${v.id}</link>
      <guid isPermaLink="false">yt:${v.id}</guid>
      <pubDate>${new Date(v.published).toUTCString()}</pubDate>
      <dc:creator>${xml(v.channel)}</dc:creator>
      ${v.categories.map((c) => `<category>${xml(c)}</category>`).join("")}
      <description>${xml(cut(`${v.channel} · ${v.description || v.title}`, 300))}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${NAME} – 새로 올라온 AI 영화·드라마</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>AI가 만든 영화·드라마·단편을 한곳에서 모아보는 사이트의 최신 영상</description>
    <language>ko</language>
    <lastBuildDate>${new Date(lastmod).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

// 검색 로봇용 미리 그린 목록 (사이트가 열리면 자바스크립트가 같은 자리를 새 화면으로 바꿈)
function ssrBlock(videos, pagesOn = true) {
  const list = videos.slice(0, SSR_COUNT);
  const cards = list.map((v) => `<a class="card" href="${pagesOn ? `/watch/${v.id}/` : `?v=${v.id}`}"><div class="thumb"><img loading="lazy" decoding="async" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" width="320" height="180" alt="${html(cut(v.title, 120))}" /></div><div class="card__body"><div><h3>${html(v.title)}</h3><p>${html(v.channel)}</p></div></div></a>`).join("\n");
  const ld = {
    "@context": "https://schema.org", "@type": "ItemList", name: "새로 올라온 AI 영화·드라마",
    itemListElement: list.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/?v=${v.id}`, name: cut(v.title, 150) })),
  };
  return `<!--SSR-->\n${cards}\n<script type="application/ld+json">${jsonLd(ld)}</script>\n<!--/SSR-->`;
}

export async function buildSeo() {
  const { videos, generatedAt } = await loadVideos();
  // 작품·영상 페이지 (index.html 의 자산 버전을 그대로 씀)
  const ver = ((await readFile(resolve(PUB, "index.html"), "utf8")).match(/assets\/style\.css\?v=([\w.-]+)/) || [])[1] || "1";
  // 관리자 > 작품 탭 "검색용 작품·영상 페이지" 스위치 (site.json 의 pages:false 면 페이지를 모두 지움 = 원상 복구)
  let pagesOn = true;
  try { pagesOn = JSON.parse(await readFile(resolve(PUB, "data/site.json"), "utf8")).pages !== false; } catch {}
  let pages = { urls: [], counts: { works: 0, videos: 0 }, changed: 0 };
  if (pagesOn) pages = await buildPages({ PUB, SITE, loadI18n, ver });
  else for (const d of ["watch", "work"]) await rm(resolve(PUB, d), { recursive: true, force: true });
  await atomicWrite(resolve(PUB, "sitemap.xml"), sitemap(generatedAt, pages.urls));
  await atomicWrite(resolve(PUB, "rss.xml"), rss(videos, generatedAt));
  const file = resolve(PUB, "index.html");
  const page = await readFile(file, "utf8");
  const next = page.replace(/<!--SSR-->[\s\S]*?<!--\/SSR-->/, () => ssrBlock(videos, pagesOn))
    .replace(/<!--HREFLANG-->[\s\S]*?<!--\/HREFLANG-->/, () => `<!--HREFLANG-->\n  ${hreflangLinks()}\n  <!--/HREFLANG-->`);
  if (next !== page) await atomicWrite(file, next);
  // 언어별 페이지
  for (const code of Object.keys(LANGS)) {
    if (code === "ko") continue;
    const I = await loadI18n(code);
    if (!I || I.lang !== code) throw new Error(`i18n 사전을 불러오지 못했어요 (${code})`);
    await mkdir(resolve(PUB, code), { recursive: true });
    await atomicWrite(resolve(PUB, code, "index.html"), localize(next, code, I));
  }
  console.log(`SEO: sitemap.xml, rss.xml(${Math.min(videos.length, RSS_COUNT)}개), index.html 미리보기 ${Math.min(videos.length, SSR_COUNT)}개, 언어별 페이지 ${Object.keys(LANGS).length - 1}개, ${pagesOn ? `작품 ${pages.counts.works}·영상 ${pages.counts.videos}개 페이지(바뀐 파일 ${pages.changed}개)` : "작품·영상 페이지 꺼짐(지움)"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSeo().catch((e) => { console.error(e); process.exit(1); });
}
