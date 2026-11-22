// 검색용 영상·작품 페이지 만들기 (seo.mjs 가 매 수집 때 호출)
//  - public/watch/<영상ID>/index.html : 영상 1개 페이지 (제목·채널·짧은 소개·유튜브 공식 플레이어·같은 작품 회차)
//  - public/work/<작품주소>/index.html : 작품(시리즈) 페이지 (작품 소개 + 1화부터 전체 회차)
// 원칙
//  - 영상은 유튜브 공식 플레이어(embed)로만 재생, 설명은 앞부분만 짧게 인용하고 원본 링크를 함께 둠
//  - 조회수처럼 매시간 바뀌는 값은 넣지 않음 → 새 영상이 생길 때만 파일이 바뀜 (GitHub 기록이 깨끗하게)
//  - 목록에서 빠진 영상·작품의 페이지는 자동으로 지움

import { readFile, writeFile, rename, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const AVATAR_URL = /^https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[\w\-./=~%]{10,500}$/;
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
const HTML_LANG = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es" };
const HOME = { ko: "/", en: "/en/", ja: "/ja/", zh: "/zh/", es: "/es/" };
const LOCALE = { ko: "ko_KR", en: "en_US", ja: "ja_JP", zh: "zh_CN", es: "es_ES" };
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
    published: new Date((x[4] || 0) * 1000).toISOString(), short: x[6] === 1,
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
function shell({ lang, title, desc, url, image, ogType, ld, body, I, ver }) {
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
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="All AI-Cinema" />
  <meta property="og:locale" content="${LOCALE[lang]}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${image}" />
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
  <script async src="https://www.googletagmanager.com/gtag/js?id=AW-947429542"></script>
  <script src="/assets/gtag-init.js?v=${ver}"></script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8096684162493748" crossorigin="anonymous"></script>
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
    <p><a href="/about.html">${esc(t("소개"))}</a> · <a href="/privacy.html">${esc(t("개인정보처리방침"))}</a></p></footer>
</body>
</html>
`;
}

const thumb = (id, q) => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
function miniCard(v, I, { now = false } = {}) {
  const n = epNum(v.title);
  return `<a class="card pg-card${now ? " is-now" : ""}" href="/watch/${v.id}/"${now ? ' aria-current="page"' : ""}>
      <div class="thumb"><img loading="lazy" decoding="async" src="${thumb(v.id, "mqdefault")}" width="320" height="180" alt="" />${n != null && v.work && !isBinge(v) ? `<span class="badge">EP.${n}</span>` : ""}</div>
      <div class="card__body"><div><h3>${esc(v.title)}</h3><p>${esc(v.channel)}</p></div></div></a>`;
}
const crumbs = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) });
const dateText = (iso, lang) => { try { return new Intl.DateTimeFormat(HTML_LANG[lang], { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(iso)); } catch { return iso.slice(0, 10); } };

function watchPage(v, ctx) {
  const { SITE, I: getI, all, ver } = ctx;
  const lang = langOf(v.title), I = getI(lang), t = (s, x) => I.t(s, x);
  const url = `${SITE}/watch/${v.id}/`;
  const ex = excerpt(v.description, 320);
  const desc = cut(ex || `${v.title} – ${v.channel}`, 155);
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
      ...(w ? { isPartOf: { "@type": "CreativeWorkSeries", name: w.name, url: `${SITE}/work/${encodeURIComponent(w.slug)}/` } } : {}),
      potentialAction: { "@type": "WatchAction", target: `https://www.youtube.com/watch?v=${v.id}` } },
    crumbs([[t("홈"), `${SITE}${HOME[lang]}`], ...(w ? [[w.name, `${SITE}/work/${encodeURIComponent(w.slug)}/`]] : cat ? [[I.name(cat), `${SITE}${HOME[lang]}?c=${encodeURIComponent(cat)}`]] : []), [cut(v.title, 80), url]]),
  ];
  const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[lang]}">${esc(t("홈"))}</a>${w ? ` › <a href="/work/${encodeURIComponent(w.slug)}/">${esc(w.name)}</a>` : cat ? ` › <a href="${HOME[lang]}?c=${encodeURIComponent(cat)}">${esc(I.name(cat))}</a>` : ""}</nav>
    <article class="pg-watch">
      <div class="pg-player"><iframe src="https://www.youtube.com/embed/${v.id}?rel=0&amp;playsinline=1&amp;hl=${lang === "zh" ? "zh-Hans" : lang}" title="${esc(v.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
      <h1 class="pg-title">${esc(v.title)}</h1>
      <p class="pg-meta">${v.cid ? `<a href="https://www.youtube.com/channel/${v.cid}" target="_blank" rel="noopener">${esc(v.channel)}</a>` : esc(v.channel)} · <time datetime="${v.published}">${esc(dateText(v.published, lang))}</time>${v.categories.length ? " · " + v.categories.map((c) => `<a href="${HOME[lang]}?c=${encodeURIComponent(c)}">${esc(I.name(c))}</a>`).join(", ") : ""}</p>
      <div class="pg-btns">
        <a class="btn btn--primary" href="${HOME[lang]}?v=${v.id}">${esc(t("다음 화 자동 재생으로 보기"))}</a>
        ${w ? `<a class="btn" href="/work/${encodeURIComponent(w.slug)}/">${esc(t("작품 보기"))} · ${esc(t("총 {n}편", { n: w.list.length }))}</a>` : ""}
        <a class="btn" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">${esc(t("YouTube에서 보기 ↗"))}</a>
      </div>
      ${prev || next ? `<div class="pg-epnav">${prev ? `<a class="pg-ep" href="/watch/${prev.id}/"><small>‹ ${esc(t("이전 화"))}</small><span>${esc(prev.title)}</span></a>` : "<span></span>"}${next ? `<a class="pg-ep pg-ep--next" href="/watch/${next.id}/"><small>${esc(t("다음 화"))} ›</small><span>${esc(next.title)}</span></a>` : ""}</div>` : ""}
      ${ex ? `<section class="pg-sec"><h2>${esc(t("영상 소개"))}</h2><p class="pg-desc">${esc(ex)}</p><p class="muted small">— ${esc(v.channel)}, <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">YouTube</a></p></section>` : ""}
    </article>
    ${w ? `<section class="pg-sec"><h2>${esc(w.name)} · ${esc(t("전체 회차"))}</h2><div class="grid pg-grid">${win.map((x) => miniCard(x, I, { now: x === v })).join("")}</div>${win.length < w.list.length ? `<p class="pg-all"><a class="btn" href="/work/${encodeURIComponent(w.slug)}/">${esc(t("전체 회차"))} · ${esc(t("총 {n}편", { n: w.list.length }))} →</a></p>` : ""}</section>` : ""}
    ${more.length ? `<section class="pg-sec"><h2>${esc(t("같은 채널의 다른 영상"))}</h2><div class="grid pg-grid">${more.map((x) => miniCard(x, I)).join("")}</div></section>` : ""}`;
  return shell({ lang, title: `${cut(v.title, 70)} | ${v.channel} – All AI-Cinema`, desc, url, image: thumb(v.id, "hqdefault"), ogType: "video.other", ld, body, I, ver });
}

function workPage(w, ctx) {
  const { SITE, I: getI, ver } = ctx;
  const lang = langOf(w.name + " " + w.list[0].title), I = getI(lang), t = (s, x) => I.t(s, x);
  const url = `${SITE}/work/${encodeURIComponent(w.slug)}/`;
  const first = w.list.find((x) => !isBinge(x)) || w.list[0];
  const cover = w.list.filter((x) => !isBinge(x)).pop() || w.list[w.list.length - 1];
  const intro = WORK_INTRO[lang](w);
  const ex = excerpt(first.description, 300);
  const desc = cut(`${intro} ${ex}`, 155);
  const ld = [
    { "@context": "https://schema.org", "@type": "CreativeWorkSeries", name: w.name, url, inLanguage: HTML_LANG[lang], description: cut(`${intro} ${ex}`, 500),
      image: thumb(cover.id, "hqdefault"),
      author: { "@type": "Organization", name: w.channel, ...(w.cid ? { url: `https://www.youtube.com/channel/${w.cid}` } : {}) },
      hasPart: w.list.map((x) => ({ "@type": "VideoObject", name: cut(x.title, 200), url: `${SITE}/watch/${x.id}/`, thumbnailUrl: thumb(x.id, "hqdefault"), uploadDate: x.published, embedUrl: `https://www.youtube.com/embed/${x.id}`, description: cut(excerpt(x.description, 300) || x.title, 300) })) },
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
          <div class="whead__btns"><a class="btn btn--primary" href="/watch/${first.id}/">${esc(t("▶ 1화부터 보기"))}</a>
            <a class="btn" href="/watch/${cover.id}/">${esc(t("최신화 보기"))}</a></div>
        </div></div>
    </section>
    <section class="pg-sec"><h2>${esc(t("작품 소개"))}</h2><p class="pg-desc">${esc(intro)}</p>${ex ? `<p class="pg-desc">${esc(ex)}</p><p class="muted small">— ${esc(w.channel)}, YouTube</p>` : ""}</section>
    <section class="pg-sec"><h2>${esc(t("전체 회차"))}</h2><div class="grid pg-grid">${w.list.map((x) => miniCard(x, I)).join("")}</div></section>`;
  return shell({ lang, title: `${w.name} – ${t("전체 회차")} | ${w.channel} – All AI-Cinema`, desc, url, image: thumb(cover.id, "hqdefault"), ogType: "website", ld, body, I, ver });
}

// 모든 페이지 쓰기 + 없어진 페이지 지우기. 사이트맵용 주소 목록을 돌려줌
export async function buildPages({ PUB, SITE, loadI18n, ver, only }) {
  const { videos, works } = await loadAll(PUB);
  const cache = {};
  for (const l of ["ko", "en", "ja", "zh", "es"]) cache[l] = await loadI18n(l);
  const ctx = { SITE, I: (l) => cache[l], all: [...videos].sort((a, b) => (a.published < b.published ? 1 : -1)), ver };
  let changed = 0;
  const pick = only ? new Set(only) : null;
  for (const v of videos) {
    if (pick && !pick.has(v.id)) continue;
    if (await writeIfChanged(resolve(PUB, "watch", v.id, "index.html"), watchPage(v, ctx))) changed++;
  }
  for (const w of works) {
    if (pick && !w.list.some((x) => pick.has(x.id))) continue;
    if (await writeIfChanged(resolve(PUB, "work", w.slug, "index.html"), workPage(w, ctx))) changed++;
  }
  if (!pick) {   // 목록에서 빠진 영상·작품 페이지 정리
    const keep = { watch: new Set(videos.map((v) => v.id)), work: new Set(works.map((w) => w.slug)) };
    for (const dir of ["watch", "work"]) {
      let names = []; try { names = await readdir(resolve(PUB, dir)); } catch {}
      for (const n of names) if (!keep[dir].has(n)) await rm(resolve(PUB, dir, n), { recursive: true, force: true });
    }
  }
  return {
    changed,
    urls: [
      ...works.map((w) => ({ loc: `${SITE}/work/${encodeURIComponent(w.slug)}/`, lastmod: w.latest })),
      ...videos.map((v) => ({ loc: `${SITE}/watch/${v.id}/`, lastmod: v.published })),
    ],
    counts: { videos: videos.length, works: works.length },
  };
}
