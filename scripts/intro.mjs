// 사이트 소개 페이지 /intro/, /en/intro/ … (7개 언어) – 검색광고 랜딩용, 광고(애드센스·띠 배너) 없음
//  - 자체 작성 글(언어별 글은 intro-text.mjs): 사이트가 하는 일, 작품 선정 기준, 에디터 추천, 장르 가이드, 이용 방법, 운영 정보·문의
//  - 숫자(편수·채널 수)·이번 주 많이 본 작품·장르별 편수는 수집 때마다 자동 갱신
//  - 에디터 추천 글: site.json workNotes("채널 / 작품")에 그 언어 글이 있으면 그 글을, 없으면 기본 소개
//  - seo.mjs 가 호출
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, loadAll, HOME, HTML_LANG } from "./pages.mjs";
import { GENRE_SLUG } from "./genre.mjs";
import { INTRO, PICK_KEYS } from "./intro-text.mjs";

const LANGS = ["ko", "en", "ja", "zh", "es", "vi", "ar"];
const HREF = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es", vi: "vi", ar: "ar" };
const P = (l) => (l === "ko" ? "/intro/" : `/${l}/intro/`);
// 정책 페이지: 한국어·영어는 기존 .html, 나머지 언어는 legal.mjs 가 만드는 /xx/terms/ · /xx/privacy/
export const POLICY = (l) => (l === "ko" ? { terms: "/terms.html", privacy: "/privacy.html" } : l === "en" ? { terms: "/en/terms.html", privacy: "/en/privacy.html" } : { terms: `/${l}/terms/`, privacy: `/${l}/privacy/` });

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildIntro({ PUB, SITE, loadI18n, ver, pagesOn = true }) {
  let site = {};
  try { site = JSON.parse(await readFile(resolve(PUB, "data/site.json"), "utf8")); } catch {}
  const { videos, works } = await loadAll(PUB);
  const notes = site.workNotes || {};
  const floor = (n) => (n >= 1000 ? Math.floor(n / 100) * 100 : n);
  const now = Date.now();
  const byKey = new Map(works.map((w) => [`${w.channel} / ${w.name}`, w]));
  const workUrl = (w) => (pagesOn ? `/work/${w.slug}/` : `/?w=${encodeURIComponent(w.name)}`);
  const watchUrl = (v) => (pagesOn ? `/watch/${v.id}/` : `/?v=${v.id}`);
  const recent = videos.filter((v) => now - Date.parse(v.published) < 7 * 864e5).sort((a, b) => b.views - a.views);
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${P(l)}" />`).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/en/intro/" />`;
  const altXml = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${P(l)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en/intro/"/>`;
  let changed = 0;
  for (const l of LANGS) {
    const T = INTRO[l], I = await loadI18n(l);
    const fmt = (n) => new Intl.NumberFormat(HTML_LANG[l]).format(n);
    const n = { videos: fmt(floor(videos.length)), channels: fmt(new Set(videos.map((v) => v.channel)).size), works: fmt(works.length), week: fmt(recent.length) };
    const L = { top: l === "ko" ? "/top/" : `/${l}/top/`, genre: l === "ko" ? "/genre/" : `/${l}/genre/` };
    const noteText = (k) => (l === "ko" && typeof notes[k] === "string" ? notes[k] : notes[k]?.[l]) || "";
    // 에디터 추천: 이 언어로 쓴 관리자 노트 먼저, 그다음 기본 추천
    const picks = [...Object.keys(notes).filter((k) => byKey.has(k) && noteText(k) && !PICK_KEYS.includes(k)).map((k) => [k, noteText(k)]),
      ...PICK_KEYS.map((k, i) => [k, noteText(k) || T.picks[i]]).filter(([k]) => byKey.has(k))].slice(0, 8);
    const top = (T.weekKo ? recent.filter((v) => v.categories.includes("한국")) : recent).slice(0, 3);
    const genres = Object.keys(T.genres).map((g) => ({ g, n: videos.filter((v) => v.categories.includes(g)).length })).filter((x) => x.n >= 12);
    const pol = POLICY(l), url = SITE + P(l);
    const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[l]}">${esc(T.home)}</a> › <span>${esc(T.crumb)}</span></nav>
    <h1 class="pg-title">${esc(T.h1)}</h1>
    <p class="pg-desc">${esc(T.lead)}</p>

    <section class="pg-sec"><h2>${esc(T.doH)}</h2>
      <ul>${T.doL(n, L).map((x) => `<li>${x}</li>`).join("")}</ul>
    </section>

    <section class="pg-sec"><h2>${esc(T.critH)}</h2>
      <ol>${T.crit.map((x) => `<li>${x}</li>`).join("")}</ol>
    </section>

    ${picks.length ? `<section class="pg-sec"><h2>${esc(T.picksH)}</h2>
      <p class="muted">${esc(T.picksSub)}</p>
      ${picks.map(([k, txt]) => { const w = byKey.get(k); return `<div class="intro-pick"><h3><a href="${workUrl(w)}">${esc(w.name.replace(/\s*\($/, ""))}</a> <small class="muted">${esc(w.channel)} · ${esc(T.eps(w.list.length))}</small></h3><p>${esc(txt)}</p></div>`; }).join("\n      ")}
    </section>` : ""}

    <section class="pg-sec"><h2>${esc(T.genreH)}</h2>
      <dl class="intro-genres">${genres.map(({ g, n: c }) => `<dt><a href="${L.genre}${GENRE_SLUG[g]}/">${esc(I.name(g))}</a> <small class="muted">${esc(T.count(fmt(c)))}</small></dt><dd>${esc(T.genres[g])}</dd>`).join("")}</dl>
    </section>

    ${top.length ? `<section class="pg-sec"><h2>${esc(T.weekH)}</h2><ol>${top.map((v) => `<li><a href="${watchUrl(v)}">${esc(v.title)}</a> <small class="muted">${esc(v.channel)}</small></li>`).join("")}</ol><p><a href="${L.top}">${esc(T.weekAll)} →</a></p></section>` : ""}

    <section class="pg-sec"><h2>${esc(T.howH)}</h2>
      <ul>${T.how.map((x) => `<li>${x}</li>`).join("")}</ul>
    </section>

    <section class="pg-sec" id="contact"><h2>${esc(T.infoH)}</h2>
      <dl class="intro-info">${T.info.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${b.includes("@") ? `<a href="mailto:${esc(b)}">${esc(b)}</a>` : esc(b)}</dd>`).join("")}
        <dt>${esc(T.policy)}</dt><dd><a href="${pol.terms}">${esc(T.terms)}</a> · <a href="${pol.privacy}">${esc(T.privacy)}</a></dd>
      </dl>
    </section>
    <p class="pg-all"><a class="btn btn--primary" href="${HOME[l]}">${esc(T.cta)} →</a></p>`;
    const desc = T.desc(n);
    const ld = [
      { "@context": "https://schema.org", "@type": "AboutPage", name: T.title, url, description: desc, inLanguage: HTML_LANG[l],
        about: { "@type": "WebSite", name: "All AI-Cinema", url: SITE + "/" } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: T.home, item: SITE + HOME[l] }, { "@type": "ListItem", position: 2, name: T.crumb, item: url }] },
    ];
    const html = shell({ lang: l, title: T.title, desc, url, image: `${SITE}/og-image.jpg?v=3`, ogType: "website", ld, body, I, ver, head: alts, noAds: true });
    if (await writeIfChanged(resolve(PUB, P(l).slice(1), "index.html"), html)) changed++;
  }
  return { changed, urls: LANGS.map((l) => ({ loc: SITE + P(l), alts: altXml })) };
}
