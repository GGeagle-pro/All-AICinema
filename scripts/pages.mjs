// 검색용 영상·작품 페이지 만들기 (seo.mjs 가 매 수집 때 호출)
//  - public/watch/<영상ID>/index.html : 영상 1개 페이지 (제목·채널·짧은 소개·유튜브 공식 플레이어·같은 작품 회차)
//  - public/work/<작품주소>/index.html : 작품(시리즈) 페이지 (작품 소개 + 1화부터 전체 회차)
// 원칙
//  - 영상은 유튜브 공식 플레이어(embed)로만 재생, 설명은 앞부분만 짧게 인용하고 원본 링크를 함께 둠
//  - 조회수처럼 매시간 바뀌는 값은 넣지 않음 → 새 영상이 생길 때만 파일이 바뀜 (GitHub 기록이 깨끗하게)
//  - 목록에서 빠진 영상·작품의 페이지는 자동으로 지움

import { readFile, writeFile, rename, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { workAnalysis, videoAnalysis, channelRanks, editorNote, noteKey, LANGS } from "./guide.mjs";

const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const AVATAR_URL = /^https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[\w\-./=~%]{10,500}$/;
export const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const cut = (s, n) => { const a = Array.from(String(s || "").replace(/\s+/g, " ").trim()); return a.length > n ? a.slice(0, n - 1).join("").trim() + "…" : a.join(""); };   // 글자 단위 (이모지가 반으로 잘리지 않게)

// 작품·회차 순서 (app.js 와 같은 규칙)
const BINGE_RE = /몰아\s?보기|모아\s?보기|통합본|완결판|전편|합본|complete\s+series|full\s+series/i;
const isBinge = (v) => BINGE_RE.test(v.title);
const EP_RE = /(?:\bep\.?|episode|에피소드)\s*0*(\d{1,3})|(?:^|[^\d])0*(\d{1,3})\s*(?:화|회차|편)(?![가-힣]*\s*몰아)/i;
const epNum = (t) => { const m = String(t).match(EP_RE); return m ? +(m[1] || m[2]) : null; };
const epSort = (a, b) => {
  const ea = epNum(a.title), eb = epNum(b.title);
  if (ea != null && eb != null && ea !== eb && isBinge(a) === isBinge(b)) return ea - eb;
  return new Date(a.published) - new Date(b.published);
};

// 작품 주소: 이름 그대로(한글 가능), 주소에 못 쓰는 글자만 정리. app.js 의 workSlug 와 같은 규칙
export const slugify = (s) => String(s || "").normalize("NFKC").toLowerCase()
  .replace(/[\s_]+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "work";

// 제목 글자로 페이지 언어 정하기
const langOf = (t) => /[가-힣]/.test(t) ? "ko" : /[぀-ヿ]/.test(t) ? "ja" : /[一-鿿]/.test(t) ? "zh" : "en";
export const HTML_LANG = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es" };
export const HOME = { ko: "/", en: "/en/", ja: "/ja/", zh: "/zh/", es: "/es/" };
const LOCALE = { ko: "ko_KR", en: "en_US", ja: "ja_JP", zh: "zh_CN", es: "es_ES" };
// 언어별 사본 (해외 검색용): /ko|en|ja|zh|es/watch/영상ID/, /…/work/작품/ – 원래 페이지(/watch/…)는 제목 언어 화면 그대로
const LP = { ko: "/ko", en: "/en", ja: "/ja", zh: "/zh", es: "/es" };
const LOCAL_TOP = 300;   // 언어별 사본을 만들 영상 수 (조회수 높은 순) – 작품 페이지는 전부
const WATCH_INTRO = {
  ko: (v) => `${v.channel} 채널이 AI로 만든 영상이에요. All AI-Cinema에서 유튜브 공식 플레이어로 무료로 볼 수 있어요.`,
  en: (v) => `An AI-made video by ${v.channel}. Watch it free with the official YouTube player on All AI-Cinema.`,
  ja: (v) => `${v.channel}がAIで制作した動画です。All AI-CinemaでYouTube公式プレーヤーから無料で視聴できます。`,
  zh: (v) => `由 ${v.channel} 用AI制作的视频。可在 All AI-Cinema 通过 YouTube 官方播放器免费观看。`,
  es: (v) => `Un video hecho con IA por ${v.channel}. Míralo gratis con el reproductor oficial de YouTube en All AI-Cinema.`,
};
const WORK_INTRO = {
  ko: (w) => `${w.channel} 채널의 AI 드라마 「${w.name}」 전체 ${w.list.length}편을 1화부터 차례로 모았어요.`,
  en: (w) => `All ${w.list.length} episodes of the AI drama "${w.name}" by ${w.channel}, in order from episode 1.`,
  ja: (w) => `${w.channel}のAIドラマ「${w.name}」全${w.list.length}話を第1話から順番にまとめました。`,
  zh: (w) => `${w.channel} 频道的AI短剧《${w.name}》全部${w.list.length}集，按第1集起顺序整理。`,
  es: (w) => `Los ${w.list.length} episodios de la serie IA «${w.name}» de ${w.channel}, en orden desde el episodio 1.`,
};

// 유튜브 설명 앞부분만 (링크·해시태그·이메일 제거)
function excerpt(desc, n) {
  const s = String(desc || "").replace(/https?:\/\/\S+/g, "").replace(/#[^\s#]+/g, "").replace(/\S+@\S+\.\S+/g, "")
    .split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 1);
  let out = "";
  for (const p of s) { if ((out + " " + p).length > n && out) break; out = (out ? out + " " : "") + p; }
  return cut(out, n);
}

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function loadAll(PUB) {
  const d = JSON.parse(await readFile(resolve(PUB, "data/videos.json"), "utf8"));
  let desc = {}; try { desc = JSON.parse(await readFile(resolve(PUB, "data/desc.json"), "utf8")); } catch {}
  const avatars = {};
  for (const [cid, u] of Object.entries(d.avatars || {})) if (CHANNEL_ID.test(cid) && AVATAR_URL.test(u)) avatars[cid] = u;
  const videos = (d.items || []).map((x) => ({
    id: x[0], title: String(x[1] || "").trim(), channel: String(d.channels?.[x[2]] || ""),
    categories: (Array.isArray(x[3]) ? x[3] : [x[3]]).map((k) => d.cats?.[k]).filter(Boolean),
    published: new Date((x[4] || 0) * 1000).toISOString(), short: x[6] === 1, views: Number(x[5]) || 0,
    cid: CHANNEL_ID.test(d.cids?.[x[7]] || "") ? d.cids[x[7]] : "",
    // app.js 의 str(series, 40) 과 같게 정리 (작품 주소가 사이트와 똑같이 나오도록)
    series: Number.isInteger(x[9]) && x[9] >= 0 ? String(d.series?.[x[9]] || "").replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, 40) : "",
    description: String(desc[x[0]] || ""),
  })).filter((v) => VIDEO_ID.test(v.id) && v.title);
  // 작품: 같은 채널 + 같은 작품 이름, 2편 이상
  const m = new Map();
  for (const v of videos) {
    if (!v.series) continue;
    const k = v.channel + "\u0001" + v.series;
    if (!m.has(k)) m.set(k, { key: k, name: v.series, channel: v.channel, cid: v.cid, list: [] });
    m.get(k).list.push(v);
  }
  const works = [...m.values()].filter((w) => w.list.length >= 2).sort((a, b) => (a.key < b.key ? -1 : 1));
  const used = new Set();
  for (const w of works) {
    let s = slugify(w.name);
    if (used.has(s)) s = `${s}-${slugify(w.channel)}`;
    used.add(s); w.slug = s;
    w.list.sort(epSort);
    w.latest = w.list.reduce((t, v) => (v.published > t ? v.published : t), "");
    for (const v of w.list) v.work = w;
  }
  return { videos, works, avatars, worksOn: true };
}

// ── 공통 틀 ──
export function shell({ lang, title, desc, url, image, ogType, ld, body, I, ver, head = "", noTrack = false, noAds = false }) {
  const t = (s, v) => I.t(s, v);
  return `<!doctype html>
<html lang="${HTML_LANG[lang]}">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="object-src 'none'; base-uri 'self'; form-action 'self'; script-src 'self' https: 'unsafe-eval'; script-src-attr 'none'; upgrade-insecure-requests" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="theme-color" content="#0b0b10" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-video-preview:-1" />
  <meta name="tdm-reservation" content="1" />
  <link rel="canonical" href="${url}" />${head ? "\n  " + head : ""}
  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="All AI-Cinema" />
  <meta property="og:locale" content="${LOCALE[lang]}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${image}" />${/maxresdefault/.test(image) ? `\n  <meta property="og:image:width" content="1280" />\n  <meta property="og:image:height" content="720" />` : ""}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/assets/logo.svg?v=2" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" />
  <link rel="manifest" href="/manifest.webmanifest?v=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css" integrity="sha384-uR1wgObmx89ZQ4VVXHdzjbDJZ1PvBK01K+E3GebmaBKdZ87qRJvBWPoPbzWeEd5T" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="/assets/style.css?v=${ver}" />
  <link rel="stylesheet" href="/assets/page.css?v=${ver}" />
  ${noTrack ? "<!-- 유튜브 '아동용' 영상: 통계·광고 추적 없음 (YouTube 개발자 정책) -->" : `<script async src="https://www.googletagmanager.com/gtag/js?id=G-5PXH52MY88"></script>
  <script src="/assets/gtag-init.js?v=${ver}"></script>${noAds ? "\n  <!-- 광고 없는 페이지 (검색광고 랜딩용) -->" : `
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8096684162493748" crossorigin="anonymous"></script>`}`}
  ${ld.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join("\n  ")}
</head>
<body class="sp-page">
  <header class="topbar"><div class="topbar__inner">
    <a class="brand" href="${HOME[lang]}"><img class="brand__mark" src="/assets/logo.svg?v=2" alt="" width="30" height="30" /><span class="brand__name">All AI-Cinema</span></a>
    <a class="pg-home" href="${HOME[lang]}">${esc(t("전체"))} →</a>
  </div></header>
  <main class="pg">
${body}
  </main>
  <footer class="footer"><p class="muted small">${esc(t("AI로 만든 영상입니다. 저작권은 원 채널에 있으며, 유튜브 공식 플레이어로 재생됩니다."))}</p>
    <p><a href="${lang === "ko" ? "/tools/" : `/${lang}/tools/`}">${esc(t("AI 제작 도구"))}</a> · <a href="${lang === "ko" ? "/about.html" : "/en/about.html"}">${esc(t("소개"))}</a> · <a href="${lang === "ko" ? "/privacy.html" : "/en/privacy.html"}">${esc(t("개인정보처리방침"))}</a></p></footer>
</body>
</html>
`;
}

const thumb = (id, q) => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
// 언어별 사본이 있으면 그 언어 주소로 링크
const watchPath = (x, ctx, l) => (l && ctx.loc?.watch.has(x.id) && langOf(x.title) !== l ? `${LP[l]}/watch/${x.id}/` : `/watch/${x.id}/`);
const workPath = (w, ctx, l) => (l && ctx.loc?.work.has(w.slug) && langOf(w.name + " " + w.list[0].title) !== l ? `${LP[l]}/work/${encodeURIComponent(w.slug)}/` : `/work/${encodeURIComponent(w.slug)}/`);
function altLinks(kind, key, orig, SITE) {
  const p = (l) => (l === orig ? `/${kind}/${key}/` : `${LP[l]}/${kind}/${key}/`);
  return [...Object.keys(LP).map((l) => `<link rel="alternate" hreflang="${HTML_LANG[l]}" href="${SITE}${p(l)}" />`), `<link rel="alternate" hreflang="x-default" href="${SITE}/${kind}/${key}/" />`].join("\n  ");
}
function altXml(kind, key, orig, SITE) {
  const p = (l) => (l === orig ? `/${kind}/${key}/` : `${LP[l]}/${kind}/${key}/`);
  return [...Object.keys(LP).map((l) => `<xhtml:link rel="alternate" hreflang="${HTML_LANG[l]}" href="${SITE}${p(l)}"/>`), `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/${kind}/${key}/"/>`].join("");
}
function miniCard(v, I, { now = false, ctx = null, l = "" } = {}) {
  const n = epNum(v.title);
  return `<a class="card pg-card${now ? " is-now" : ""}" href="${ctx ? watchPath(v, ctx, l) : `/watch/${v.id}/`}"${now ? ' aria-current="page"' : ""}>
      <div class="thumb"><img loading="lazy" decoding="async" src="${thumb(v.id, "mqdefault")}" width="320" height="180" alt="" />${n != null && v.work && !isBinge(v) ? `<span class="badge">EP.${n}</span>` : ""}</div>
      <div class="card__body"><div><h3>${esc(v.title)}</h3><p>${esc(v.channel)}</p></div></div></a>`;
}
const crumbs = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) });
const dateText = (iso, lang) => { try { return new Intl.DateTimeFormat(HTML_LANG[lang], { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(iso)); } catch { return iso.slice(0, 10); } };

function watchPage(v, ctx, force = "") {
  const { SITE, I: getI, all, ver } = ctx;
  const orig = langOf(v.title), lang = force || orig, I = getI(lang), t = (s, x) => I.t(s, x);
  const url = force ? `${SITE}${LP[force]}/watch/${v.id}/` : `${SITE}/watch/${v.id}/`;
  const ex = excerpt(v.description, 320);
  const intro = force ? WATCH_INTRO[force](v) : "";
  const desc = cut(force ? `${intro} ${ex}` : ex || `${v.title} – ${v.channel}`, 155);
  const L = force;   // 링크도 같은 언어 사본으로
  const head = ctx.loc?.watch.has(v.id) ? altLinks("watch", v.id, orig, SITE) : "";
  const w = v.work;
  const i = w ? w.list.indexOf(v) : -1;
  const prev = w && i > 0 ? w.list[i - 1] : null, next = w && i >= 0 && i < w.list.length - 1 ? w.list[i + 1] : null;
  // 같은 채널: 이 영상 바로 전에 올라온 영상 위주 (새 영상이 올라와도 예전 페이지가 거의 안 바뀌게)
  const chAll = all.filter((x) => x.channel === v.channel && (!w || x.work !== w) && x.id !== v.id);
  const older = chAll.filter((x) => x.published < v.published).slice(0, 8);
  const more = older.length >= 8 ? older : [...older, ...chAll.filter((x) => x.published >= v.published).slice(-(8 - older.length))];
  // 같은 작품 회차: 많으면 지금 회차 앞뒤 12편만 (전체는 작품 페이지에)
  const win = !w ? [] : w.list.length <= 12 ? w.list : w.list.slice(Math.max(0, Math.min(i - 5, w.list.length - 12)), Math.max(0, Math.min(i - 5, w.list.length - 12)) + 12);
  const cat = v.categories[0] || "";
  const ld = [
    { "@context": "https://schema.org", "@type": "VideoObject", name: cut(v.title, 200), description: cut(ex || v.title, 500),
      thumbnailUrl: [thumb(v.id, "maxresdefault"), thumb(v.id, "hqdefault"), thumb(v.id, "mqdefault")],
      uploadDate: v.published, embedUrl: `https://www.youtube.com/embed/${v.id}`, url, inLanguage: HTML_LANG[lang],
      ...(v.categories.length ? { genre: v.categories } : {}),
      author: { "@type": "Organization", name: v.channel, ...(v.cid ? { url: `https://www.youtube.com/channel/${v.cid}` } : {}) },
      ...(w ? { isPartOf: { "@type": "CreativeWorkSeries", name: w.name, url: `${SITE}${workPath(w, ctx, L)}` } } : {}),
      potentialAction: { "@type": "WatchAction", target: `https://www.youtube.com/watch?v=${v.id}` } },
    crumbs([[t("홈"), `${SITE}${HOME[lang]}`], ...(w ? [[w.name, `${SITE}${workPath(w, ctx, L)}`]] : cat ? [[I.name(cat), `${SITE}${HOME[lang]}?c=${encodeURIComponent(cat)}`]] : []), [cut(v.title, 80), url]]),
  ];
  const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[lang]}">${esc(t("홈"))}</a>${w ? ` › <a href="${workPath(w, ctx, L)}">${esc(w.name)}</a>` : cat ? ` › <a href="${HOME[lang]}?c=${encodeURIComponent(cat)}">${esc(I.name(cat))}</a>` : ""}</nav>
    <article class="pg-watch">
      <div class="pg-player"><iframe src="https://www.youtube.com/embed/${v.id}?rel=0&amp;playsinline=1&amp;hl=${lang === "zh" ? "zh-Hans" : lang}" title="${esc(v.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
      <h1 class="pg-title">${esc(v.title)}</h1>${intro ? `\n      <p class="pg-intro">${esc(intro)}</p>` : ""}
      ${(() => { const w = ctx.workOf?.get(v.id); const a = videoAnalysis(v, lang, { rank: ctx.ranks?.get(v.id), work: w && !isBinge(v) ? w.name : "", ep: w ? w.list.filter((x) => !isBinge(x)).indexOf(v) + 1 : 0, name: (c) => I.name(c), countries: ctx.countries }); return a ? `<p class="pg-ana">${esc(a)}</p>` : ""; })()}
      <p class="pg-meta">${v.cid ? `<a href="https://www.youtube.com/channel/${v.cid}" target="_blank" rel="noopener">${esc(v.channel)}</a>` : esc(v.channel)} · <time datetime="${v.published}">${esc(dateText(v.published, lang))}</time>${v.categories.length ? " · " + v.categories.map((c) => `<a href="${HOME[lang]}?c=${encodeURIComponent(c)}">${esc(I.name(c))}</a>`).join(", ") : ""}</p>
      <div class="pg-btns">
        <a class="btn btn--primary" href="${HOME[lang]}?v=${v.id}">${esc(t("다음 화 자동 재생으로 보기"))}</a>
        ${w ? `<a class="btn" href="${workPath(w, ctx, L)}">${esc(t("작품 보기"))} · ${esc(t("총 {n}편", { n: w.list.length }))}</a>` : ""}
        <a class="btn" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">${esc(t("YouTube에서 보기 ↗"))}</a>
      </div>
      ${prev || next ? `<div class="pg-epnav">${prev ? `<a class="pg-ep" href="${watchPath(prev, ctx, L)}"><small>‹ ${esc(t("이전 화"))}</small><span>${esc(prev.title)}</span></a>` : "<span></span>"}${next ? `<a class="pg-ep pg-ep--next" href="${watchPath(next, ctx, L)}"><small>${esc(t("다음 화"))} ›</small><span>${esc(next.title)}</span></a>` : ""}</div>` : ""}
      ${ex ? `<section class="pg-sec"><h2>${esc(t("영상 소개"))}</h2><p class="pg-desc">${esc(ex)}</p><p class="muted small">— ${esc(v.channel)}, <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">YouTube</a></p></section>` : ""}
    </article>
    ${w ? `<section class="pg-sec"><h2>${esc(w.name)} · ${esc(t("전체 회차"))}</h2><div class="grid pg-grid">${win.map((x) => miniCard(x, I, { now: x === v, ctx, l: L })).join("")}</div>${win.length < w.list.length ? `<p class="pg-all"><a class="btn" href="${workPath(w, ctx, L)}">${esc(t("전체 회차"))} · ${esc(t("총 {n}편", { n: w.list.length }))} →</a></p>` : ""}</section>` : ""}
    ${more.length ? `<section class="pg-sec"><h2>${esc(t("같은 채널의 다른 영상"))}</h2><div class="grid pg-grid">${more.map((x) => miniCard(x, I, { ctx, l: L })).join("")}</div></section>` : ""}`;
  return shell({ lang, title: `${cut(v.title, 70)} | ${v.channel} – All AI-Cinema`, desc, url, image: ctx.big.has(v.id) ? thumb(v.id, "maxresdefault") : thumb(v.id, "hqdefault"), ogType: "video.other", ld, body, I, ver, head, noTrack: !!ctx.kids?.has(v.id) });
}

// ── 작품 가이드 (사이트가 직접 만든 정보: 유튜브 데이터만 있는 페이지가 되지 않게) ──
const GUIDE = {
  ko: { ana: "작품 분석", t: "작품 가이드", genre: "장르·국가", eps: "공개된 회차", first: "첫 화 공개", last: "최근 화 공개", every: "업데이트 주기", everyV: (d) => (d < 1.5 ? "거의 매일" : `평균 ${Math.round(d)}일마다`), done: "완결 또는 휴식 중", rec: "이런 분께 추천해요", note: "에디터 노트", same: "같은 채널의 다른 작품", like: "비슷한 장르 작품", n: (n) => `${n}화` },
  en: { ana: "Analysis", t: "Series guide", genre: "Genre & country", eps: "Episodes", first: "First episode", last: "Latest episode", every: "Update pace", everyV: (d) => (d < 1.5 ? "Almost daily" : `About every ${Math.round(d)} days`), done: "Finished or on break", rec: "Who will enjoy it", note: "Editor's note", same: "More from this channel", like: "Similar series", n: (n) => `${n} eps` },
  ja: { ana: "作品分析", t: "作品ガイド", genre: "ジャンル・国", eps: "公開話数", first: "第1話公開", last: "最新話公開", every: "更新ペース", everyV: (d) => (d < 1.5 ? "ほぼ毎日" : `平均${Math.round(d)}日ごと`), done: "完結または休止中", rec: "こんな方におすすめ", note: "編集部メモ", same: "同じチャンネルの作品", like: "似たジャンルの作品", n: (n) => `全${n}話` },
  zh: { ana: "作品分析", t: "作品指南", genre: "类型与国家", eps: "已更新集数", first: "第1集上线", last: "最新一集", every: "更新频率", everyV: (d) => (d < 1.5 ? "几乎每天" : `平均每${Math.round(d)}天`), done: "已完结或暂停", rec: "推荐给这些观众", note: "编辑点评", same: "同频道的其他作品", like: "类似类型作品", n: (n) => `共${n}集` },
  es: { ana: "Análisis", t: "Guía de la serie", genre: "Género y país", eps: "Episodios", first: "Primer episodio", last: "Último episodio", every: "Ritmo", everyV: (d) => (d < 1.5 ? "Casi a diario" : `Cada ${Math.round(d)} días aprox.`), done: "Terminada o en pausa", rec: "Para quién es", note: "Nota del editor", same: "Más de este canal", like: "Series parecidas", n: (n) => `${n} episodios` },
};
// 장르별 추천 문구 (사이트에서 직접 쓴 글)
const REC = {
  "액션·히어로": { ko: "시원한 액션과 통쾌한 반전을 좋아하는 분", en: "Fans of big action and satisfying comebacks", ja: "爽快なアクションと逆転劇が好きな方", zh: "喜欢爽快动作与逆袭剧情的观众", es: "Quienes disfrutan la acción y las remontadas" },
  "판타지": { ko: "현실에서 볼 수 없는 세계와 능력이 궁금한 분", en: "Viewers who love other worlds and special powers", ja: "異世界や特殊能力の物語が好きな方", zh: "喜欢异世界与超能力设定的观众", es: "Amantes de mundos fantásticos y poderes" },
  "사극·무협": { ko: "옛날 배경, 궁중 암투, 무협 액션을 즐기는 분", en: "Fans of period drama, palace intrigue and martial arts", ja: "時代劇・宮廷劇・武侠アクションが好きな方", zh: "喜欢古装、宫斗与武侠的观众", es: "Fans de época, intrigas de palacio y artes marciales" },
  "SF": { ko: "미래 기술, 우주, AI가 등장하는 이야기를 좋아하는 분", en: "Sci-fi fans: future tech, space and AI", ja: "未来技術・宇宙・AIの物語が好きな方", zh: "喜欢未来科技、太空与AI题材的观众", es: "Fans de la ciencia ficción, el espacio y la IA" },
  "미스터리·스릴러": { ko: "끝까지 범인과 진실을 추리하고 싶은 분", en: "Anyone who likes to solve the mystery before the end", ja: "最後まで謎解きを楽しみたい方", zh: "喜欢推理悬疑、猜真相的观众", es: "Quienes quieren resolver el misterio antes del final" },
  "코미디": { ko: "가볍게 웃으며 보고 싶은 분", en: "Anyone looking for a light laugh", ja: "気軽に笑いたい方", zh: "想轻松一笑的观众", es: "Quienes buscan reír sin complicaciones" },
  "드라마": { ko: "인물의 감정과 관계 변화를 따라가는 이야기를 좋아하는 분", en: "Viewers who enjoy character-driven stories", ja: "人物の感情や関係の変化を味わいたい方", zh: "喜欢人物情感与关系变化的观众", es: "Quienes disfrutan historias centradas en personajes" },
  "로맨스": { ko: "설레는 연애와 반전 있는 사랑 이야기를 찾는 분", en: "Romance fans who like a twist", ja: "ときめく恋愛と逆転劇が好きな方", zh: "喜欢心动恋爱与反转爱情的观众", es: "Amantes del romance con giros" },
  "공포": { ko: "오싹한 분위기와 긴장감을 즐기는 분", en: "Horror fans who like the tension", ja: "ぞくっとする緊張感が好きな方", zh: "喜欢惊悚紧张氛围的观众", es: "Fans del terror y la tensión" },
  "애니메이션": { ko: "그림체와 연출이 독특한 AI 애니메이션이 궁금한 분", en: "Curious about the look of AI animation", ja: "AIアニメの独特な絵柄と演出が気になる方", zh: "想看风格独特的AI动画的观众", es: "Curiosos por la animación hecha con IA" },
};
function workGuide(w, ctx, I, lang, L) {
  const G = GUIDE[lang], eps = w.list.filter((x) => !isBinge(x));
  const ts = eps.map((x) => Date.parse(x.published)).filter(Number.isFinite).sort((a, b) => a - b);
  const span = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / 864e5 / (ts.length - 1) : 0;
  const idle = ts.length ? (Date.now() - ts[ts.length - 1]) / 864e5 : 0;
  const cats = [...new Set(w.list.flatMap((x) => x.categories))].filter((c) => c !== "기타");
  const recs = cats.map((c) => REC[c]?.[lang]).filter(Boolean).slice(0, 3);
  const note = editorNote(ctx.notes, w, lang);
  const ana = workAnalysis({ ...w, list: w.list.filter((x) => !isBinge(x)) }, lang, (c) => I.name(c), ctx.countries);
  const others = (ctx.works || []).filter((o) => o !== w && o.channel === w.channel).slice(0, 6);
  const like = (ctx.works || []).filter((o) => o !== w && o.channel !== w.channel && o.list.some((x) => x.categories.some((c) => cats.includes(c) && !ctx.countries?.has(c)))).slice(0, 6);
  const wl = (o) => `<li><a href="${workPath(o, ctx, L)}">${esc(o.name)}</a> <span class="muted">· ${esc(o.channel)} · ${esc(G.n(o.list.length))}</span></li>`;
  return `<section class="pg-sec wg"><h2>${esc(G.t)}</h2>
      ${note ? `<div class="wg-note"><b>${esc(G.note)}</b><p>${esc(note)}</p></div>` : ""}
      ${ana ? `<div class="wg-ana"><b>${esc(G.ana)}</b><p>${esc(ana)}</p></div>` : ""}
      <dl class="geo-facts wg-facts">
        ${cats.length ? `<div><dt>${esc(G.genre)}</dt><dd>${cats.map((c) => esc(I.name(c))).join(" · ")}</dd></div>` : ""}
        <div><dt>${esc(G.eps)}</dt><dd>${esc(G.n(eps.length))}</dd></div>
        ${ts.length ? `<div><dt>${esc(G.first)}</dt><dd>${esc(dateText(new Date(ts[0]).toISOString(), lang))}</dd></div><div><dt>${esc(G.last)}</dt><dd>${esc(dateText(new Date(ts[ts.length - 1]).toISOString(), lang))}</dd></div>` : ""}
        ${span ? `<div><dt>${esc(G.every)}</dt><dd>${esc(idle > Math.max(14, span * 4) ? G.done : G.everyV(span))}</dd></div>` : ""}
      </dl>
      ${recs.length ? `<h3 class="wg-h">${esc(G.rec)}</h3><ul class="wg-rec">${recs.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    </section>
    ${others.length ? `<section class="pg-sec"><h2>${esc(G.same)}</h2><ul class="geo-list">${others.map(wl).join("")}</ul></section>` : ""}
    ${like.length ? `<section class="pg-sec"><h2>${esc(G.like)}</h2><ul class="geo-list">${like.map(wl).join("")}</ul></section>` : ""}`;
}

function workPage(w, ctx, force = "") {
  const { SITE, I: getI, ver } = ctx;
  const orig = langOf(w.name + " " + w.list[0].title), lang = force || orig, I = getI(lang), t = (s, x) => I.t(s, x);
  const L = force;
  const url = force ? `${SITE}${LP[force]}/work/${encodeURIComponent(w.slug)}/` : `${SITE}/work/${encodeURIComponent(w.slug)}/`;
  const head = ctx.loc?.work.has(w.slug) ? altLinks("work", encodeURIComponent(w.slug), orig, SITE) : "";
  const first = w.list.find((x) => !isBinge(x)) || w.list[0];
  const cover = w.list.filter((x) => !isBinge(x)).pop() || w.list[w.list.length - 1];
  const intro = WORK_INTRO[lang](w);
  const ex = excerpt(first.description, 300);
  const desc = cut(`${intro} ${ex}`, 155);
  const ld = [
    { "@context": "https://schema.org", "@type": "CreativeWorkSeries", name: w.name, url, inLanguage: HTML_LANG[lang], description: cut(`${intro} ${ex}`, 500),
      image: thumb(cover.id, "hqdefault"),
      author: { "@type": "Organization", name: w.channel, ...(w.cid ? { url: `https://www.youtube.com/channel/${w.cid}` } : {}) },
      hasPart: w.list.map((x) => ({ "@type": "VideoObject", name: cut(x.title, 200), url: `${SITE}${watchPath(x, ctx, L)}`, thumbnailUrl: thumb(x.id, "hqdefault"), uploadDate: x.published, embedUrl: `https://www.youtube.com/embed/${x.id}`, description: cut(excerpt(x.description, 300) || x.title, 300) })) },
    crumbs([[t("홈"), `${SITE}${HOME[lang]}`], [w.name, url]]),
  ];
  const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[lang]}">${esc(t("홈"))}</a> › <span>${esc(t("작품"))}</span></nav>
    <section class="whead pg-whead">
      <div class="whead__bg" style="background-image:url('${thumb(cover.id, "hqdefault")}')"></div>
      <div class="whead__in">
        <img class="whead__poster" src="${thumb(cover.id, "mqdefault")}" alt="" width="320" height="180" />
        <div class="whead__txt">
          <span class="whead__eyebrow">${esc(t("작품"))}</span>
          <h1>${esc(w.name)}</h1>
          <p class="whead__ch"><span>${esc(w.channel)}</span></p>
          <p class="whead__meta">${esc(t("총 {n}편", { n: w.list.length }))} · ${esc(dateText(w.latest, lang))}</p>
          <div class="whead__btns"><a class="btn btn--primary" href="${watchPath(first, ctx, L)}">${esc(t("▶ 1화부터 보기"))}</a>
            <a class="btn" href="${watchPath(cover, ctx, L)}">${esc(t("최신화 보기"))}</a></div>
        </div></div>
    </section>
    <section class="pg-sec"><h2>${esc(t("작품 소개"))}</h2><p class="pg-desc">${esc(intro)}</p>${ex ? `<p class="pg-desc">${esc(ex)}</p><p class="muted small">— ${esc(w.channel)}, YouTube</p>` : ""}</section>
    ${workGuide(w, ctx, I, lang, L)}
    <section class="pg-sec"><h2>${esc(t("전체 회차"))}</h2><div class="grid pg-grid">${w.list.map((x) => miniCard(x, I, { ctx, l: L })).join("")}</div></section>`;
  return shell({ lang, title: `${w.name} – ${t("전체 회차")} | ${w.channel} – All AI-Cinema`, desc, url, image: ctx.big.has(cover.id) ? thumb(cover.id, "maxresdefault") : thumb(cover.id, "hqdefault"), ogType: "website", ld, body, I, ver, head });
}

// 공유 미리보기(카카오톡 등)용 큰 썸네일: 유튜브 maxresdefault(1280×720)가 있는 영상만 (없으면 hqdefault)
// 한 번 확인한 결과는 cache/thumbs.json 에 저장 → 새 영상만 확인. 확인 실패(네트워크)는 저장하지 않음
async function bigThumbs(PUB, ids) {
  const file = resolve(PUB, "../cache/thumbs.json");
  let known = {};
  try { known = JSON.parse(await readFile(file, "utf8")); } catch {}
  const todo = ids.filter((id) => !(id in known)).slice(0, 400);
  let i = 0, changed = false;
  async function worker() {
    while (i < todo.length) {
      const id = todo[i++];
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 6000);
        const res = await fetch(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, { method: "HEAD", signal: ctl.signal });
        clearTimeout(tm);
        if (res.status === 200 || res.status === 404) { known[id] = res.status === 200 ? 1 : 0; changed = true; }
      } catch {}
    }
  }
  if (todo.length && typeof fetch === "function") await Promise.all(Array.from({ length: 8 }, worker));
  const keep = new Set(ids);
  for (const k of Object.keys(known)) if (!keep.has(k)) { delete known[k]; changed = true; }
  if (changed) { await mkdir(resolve(file, ".."), { recursive: true }); await writeFile(file, JSON.stringify(known) + "\n"); }
  return new Set(Object.keys(known).filter((k) => known[k] === 1));
}

// 모든 페이지 쓰기 + 없어진 페이지 지우기. 사이트맵용 주소 목록을 돌려줌
export async function buildPages({ PUB, SITE, loadI18n, ver, only }) {
  const { videos, works } = await loadAll(PUB);
  const cache = {};
  for (const l of ["ko", "en", "ja", "zh", "es"]) cache[l] = await loadI18n(l);
  const big = await bigThumbs(PUB, videos.map((v) => v.id));
  // 언어별 사본 대상: 조회수 높은 영상 LOCAL_TOP개 + 모든 작품
  const loc = { watch: new Set([...videos].sort((a, b) => b.views - a.views).slice(0, LOCAL_TOP).map((v) => v.id)), work: new Set(works.map((w) => w.slug)) };
  let kids = new Set();
  try { const raw = JSON.parse(await readFile(resolve(PUB, "data/videos.json"), "utf8")); kids = new Set(Array.isArray(raw.kids) ? raw.kids : []); } catch {}
  // 관리자가 쓴 작품 소개(에디터 노트): site.json 의 workNotes { 작품주소: "글" }
  let notes = {}, countries = new Set(["한국", "미국", "일본", "중국"]);
  try { const st = JSON.parse(await readFile(resolve(PUB, "data/site.json"), "utf8")); if (st.workNotes && typeof st.workNotes === "object") notes = st.workNotes; if (Array.isArray(st.countries)) countries = new Set(st.countries); } catch {}
  const workOf = new Map(); for (const w of works) for (const x of w.list) workOf.set(x.id, w);
  const ctx = { SITE, I: (l) => cache[l], all: [...videos].sort((a, b) => (a.published < b.published ? 1 : -1)), ver, big, loc, kids, notes, works, countries, workOf, ranks: channelRanks(videos) };
  // 사이트 화면(작품 보기)에서 언어에 맞춰 보여 줄 작품 분석·에디터 노트·추천 문구
  {
    const out = {};
    for (const w of works) {
      const o = {};
      for (const l of LANGS) {
        const I = cache[l] || cache.ko;
        const cats = [...new Set(w.list.flatMap((x) => x.categories))];
        o[l] = { a: workAnalysis({ ...w, list: w.list.filter((x) => !isBinge(x)) }, l, (c) => I.name(c), countries), n: editorNote(notes, w, l), r: cats.map((c) => REC[c]?.[l]).filter(Boolean).slice(0, 3) };
      }
      out[noteKey(w)] = o;
    }
    const f = resolve(PUB, "data/guides.json"), text = JSON.stringify({ v: 1, works: out });
    let old = ""; try { old = await readFile(f, "utf8"); } catch {}
    if (old !== text) { await writeFile(f + ".tmp", text); await rename(f + ".tmp", f); }
  }
  let changed = 0;
  const pick = only ? new Set(only) : null;
  const keepL = Object.fromEntries(Object.keys(LP).map((l) => [l, { watch: new Set(), work: new Set() }]));
  const urls = [];
  for (const v of videos) {
    const orig = langOf(v.title), alts = loc.watch.has(v.id) ? altXml("watch", v.id, orig, SITE) : "";
    urls.push({ loc: `${SITE}/watch/${v.id}/`, lastmod: v.published, alts });
    if (loc.watch.has(v.id)) for (const l of Object.keys(LP)) if (l !== orig) { keepL[l].watch.add(v.id); urls.push({ loc: `${SITE}${LP[l]}/watch/${v.id}/`, lastmod: v.published, alts }); }
    if (pick && !pick.has(v.id)) continue;
    if (await writeIfChanged(resolve(PUB, "watch", v.id, "index.html"), watchPage(v, ctx))) changed++;
    if (loc.watch.has(v.id)) for (const l of Object.keys(LP)) if (l !== orig && await writeIfChanged(resolve(PUB, LP[l].slice(1), "watch", v.id, "index.html"), watchPage(v, ctx, l))) changed++;
  }
  for (const w of works) {
    const orig = langOf(w.name + " " + w.list[0].title), key = encodeURIComponent(w.slug), alts = altXml("work", key, orig, SITE);
    urls.unshift({ loc: `${SITE}/work/${key}/`, lastmod: w.latest, alts });
    for (const l of Object.keys(LP)) if (l !== orig) { keepL[l].work.add(w.slug); urls.push({ loc: `${SITE}${LP[l]}/work/${key}/`, lastmod: w.latest, alts }); }
    if (pick && !w.list.some((x) => pick.has(x.id))) continue;
    if (await writeIfChanged(resolve(PUB, "work", w.slug, "index.html"), workPage(w, ctx))) changed++;
    for (const l of Object.keys(LP)) if (l !== orig && await writeIfChanged(resolve(PUB, LP[l].slice(1), "work", w.slug, "index.html"), workPage(w, ctx, l))) changed++;
  }
  if (!pick) {   // 목록에서 빠진 영상·작품 페이지 정리 (언어별 사본 포함)
    const keep = { watch: new Set(videos.map((v) => v.id)), work: new Set(works.map((w) => w.slug)) };
    const sweep = async (base, k) => {
      for (const dir of ["watch", "work"]) {
        let names = []; try { names = await readdir(resolve(PUB, base, dir)); } catch {}
        for (const n of names) if (!k[dir].has(n)) await rm(resolve(PUB, base, dir, n), { recursive: true, force: true });
      }
    };
    await sweep(".", keep);
    for (const l of Object.keys(LP)) await sweep(LP[l].slice(1), keepL[l]);
  }
  return {
    changed,
    urls,
    counts: { videos: videos.length, works: works.length },
  };
}
